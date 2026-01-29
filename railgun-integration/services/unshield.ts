import {
  NetworkName,
  RailgunERC20AmountRecipient,
  calculateGasPrice,
  type SelectedBroadcaster,
} from "@railgun-community/shared-models";
import {
  gasEstimateForUnprovenUnshield,
  generateUnshieldProof,
  populateProvedUnshield,
} from "@railgun-community/wallet";
import type { Wallet, HDNodeWallet } from "ethers";
import { engine } from "../core/engine";
import { NETWORK_CONFIG, type TransactionMode } from "../utils/config";
import { getGasDetailsForTransaction, getOriginalGasDetailsForTransaction, getBroadcasterFeeDetails, serializeERC20Transfer } from "../utils/gas";
import { createLogger } from "../utils/logger";
import { TransactionError, ProofGenerationError } from "../utils/errors";
import type { UnshieldParams } from "../core/types";

const logger = createLogger("UnshieldService");

export class UnshieldService {
  async estimateUnshieldGas(
    params: UnshieldParams,
    sendWithPublicWallet: boolean,
    broadcasterFee?: RailgunERC20AmountRecipient,
    rpcUrl?: string
  ): Promise<bigint> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      const recipients = this.formatRecipients(params);

      const originalGasDetails = await getOriginalGasDetailsForTransaction(
        engine.getNetwork(),
        sendWithPublicWallet,
        rpcUrl ?? NETWORK_CONFIG.RPC_URL
      );

      const feeTokenDetails = broadcasterFee ?? undefined;

      const { gasEstimate } = await gasEstimateForUnprovenUnshield(
        engine.getTxidVersion(),
        engine.getNetwork(),
        params.senderWalletID,
        params.encryptionKey,
        recipients,
        [],
        originalGasDetails,
        feeTokenDetails,
        sendWithPublicWallet
      );

      logger.debug(`Unshield gas estimate: ${gasEstimate}`);
      return gasEstimate;
    } catch (error) {
      logger.error("Failed to estimate unshield gas", error);
      throw new TransactionError(`Gas estimation failed: ${error}`);
    }
  }

  async generateProof(
    params: UnshieldParams,
    gasEstimate: bigint,
    wallet: Wallet | HDNodeWallet,
    broadcasterFee?: RailgunERC20AmountRecipient,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      logger.info(`Generating ZK proof for unshield`);

      const recipients = this.formatRecipients(params);

      const gasDetails = await getGasDetailsForTransaction(
        engine.getNetwork(),
        gasEstimate,
        true,
        wallet,
        NETWORK_CONFIG.RPC_URL
      );

      const overallBatchMinGasPrice = calculateGasPrice(gasDetails);

      await generateUnshieldProof(
        engine.getTxidVersion(),
        engine.getNetwork(),
        params.senderWalletID,
        params.encryptionKey,
        recipients,
        [],
        broadcasterFee,
        true,
        overallBatchMinGasPrice,
        progressCallback ?? ((progress: number) => logger.debug(`Proof progress: ${progress}%`))
      );

      logger.info("ZK proof generated successfully");
    } catch (error) {
      logger.error("Failed to generate ZK proof", error);
      throw new ProofGenerationError(`Proof generation failed: ${error}`);
    }
  }

  async populateUnshield(
    params: UnshieldParams,
    gasEstimate: bigint,
    wallet?: Wallet | HDNodeWallet,
    sendWithPublicWallet: boolean,
    broadcasterFee?: RailgunERC20AmountRecipient,
    rpcUrl?: string
  ): Promise<any> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      const recipients = this.formatRecipients(params);

      let gasDetails;
      if (sendWithPublicWallet) {
        gasDetails = await getGasDetailsForTransaction(
          engine.getNetwork(),
          gasEstimate,
          true,
          wallet,
          NETWORK_CONFIG.RPC_URL
        );
      } else if (wallet) {
        gasDetails = await getGasDetailsForTransaction(
          engine.getNetwork(),
          gasEstimate,
          true,
          wallet,
          NETWORK_CONFIG.RPC_URL
        );
      } else {
        gasDetails = {
          evmGasType: 2 as const,
          gasEstimate,
          maxFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxFeePerGas,
          maxPriorityFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxPriorityFeePerGas,
        };
      }

      const overallBatchMinGasPrice = calculateGasPrice(gasDetails);

      const response = await populateProvedUnshield(
        engine.getTxidVersion(),
        engine.getNetwork(),
        params.senderWalletID,
        recipients,
        [],
        broadcasterFee,
        sendWithPublicWallet,
        overallBatchMinGasPrice,
        gasDetails
      );

      logger.info("Unshield transaction populated successfully");

      return response.transaction;
    } catch (error) {
      logger.error("Failed to populate unshield", error);
      throw new TransactionError(`Unshield population failed: ${error}`);
    }
  }

  async executeUnshield(
    params: UnshieldParams,
    wallet?: Wallet | HDNodeWallet,
    mode: TransactionMode,
    broadcaster?: SelectedBroadcaster,
    rpcUrl?: string,
    progressCallback?: (progress: number) => void
  ): Promise<{ transaction: any; gasEstimate: bigint; broadcasterFee?: RailgunERC20AmountRecipient }> {
    const sendWithPublicWallet = mode === "self_signing";

    const gasEstimate = await this.estimateUnshieldGas(
      params,
      sendWithPublicWallet,
      undefined,
      rpcUrl
    );

    let broadcasterFee: RailgunERC20AmountRecipient | undefined;

    if (!sendWithPublicWallet) {
      const gasDetails = {
        evmGasType: 2 as const,
        gasEstimate,
        maxFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxFeePerGas,
        maxPriorityFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxPriorityFeePerGas,
      };

      broadcasterFee = await getBroadcasterFeeDetails(
        engine.getNetwork(),
        params.tokenAddress,
        gasDetails,
        false,
        broadcaster
      );
    }

    await this.generateProof(
      params,
      gasEstimate,
      sendWithPublicWallet ? wallet : undefined,
      broadcasterFee,
      progressCallback
    );

    const transaction = await this.populateUnshield(
      params,
      gasEstimate,
      sendWithPublicWallet ? wallet : undefined,
      sendWithPublicWallet,
      broadcasterFee,
      rpcUrl
    );

    return {
      transaction,
      gasEstimate,
      broadcasterFee,
    };
  }

  private formatRecipients(params: UnshieldParams): RailgunERC20AmountRecipient[] {
    return [{
      tokenAddress: params.tokenAddress,
      amount: params.amount,
      recipientAddress: params.recipientPublicAddress,
    }];
  }
}

export const unshieldService = new UnshieldService();
