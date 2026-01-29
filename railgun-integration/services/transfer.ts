import {
  NetworkName,
  RailgunERC20AmountRecipient,
  calculateGasPrice,
  type SelectedBroadcaster,
} from "@railgun-community/shared-models";
import {
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
} from "@railgun-community/wallet";
import type { Wallet, HDNodeWallet } from "ethers";
import { engine } from "../core/engine";
import { NETWORK_CONFIG, type TransactionMode } from "../utils/config";
import { getGasDetailsForTransaction, getOriginalGasDetailsForTransaction, getBroadcasterFeeDetails } from "../utils/gas";
import { createLogger } from "../utils/logger";
import { TransactionError, ProofGenerationError } from "../utils/errors";
import type { TransferParams } from "../core/types";

const logger = createLogger("TransferService");

export class TransferService {
  async estimateTransferGas(
    params: TransferParams,
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

      const { gasEstimate } = await gasEstimateForUnprovenTransfer(
        engine.getTxidVersion(),
        engine.getNetwork(),
        params.senderWalletID,
        params.encryptionKey,
        params.memo ?? "",
        recipients,
        [],
        originalGasDetails,
        broadcasterFee,
        sendWithPublicWallet
      );

      logger.debug(`Transfer gas estimate: ${gasEstimate}`);
      return gasEstimate;
    } catch (error) {
      logger.error("Failed to estimate transfer gas", error);
      throw new TransactionError(`Gas estimation failed: ${error}`);
    }
  }

  async generateProof(
    params: TransferParams,
    broadcasterFee?: RailgunERC20AmountRecipient,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      logger.info(`Generating ZK proof for transfer`);

      const recipients = this.formatRecipients(params);

      await generateTransferProof(
        engine.getTxidVersion(),
        engine.getNetwork(),
        params.senderWalletID,
        params.encryptionKey,
        true,
        params.memo ?? "",
        recipients,
        [],
        broadcasterFee,
        true,
        undefined,
        progressCallback ?? ((progress: number) => logger.debug(`Proof progress: ${progress}%`))
      );

      logger.info("ZK proof generated successfully");
    } catch (error) {
      logger.error("Failed to generate ZK proof", error);
      throw new ProofGenerationError(`Proof generation failed: ${error}`);
    }
  }

  async populateTransfer(
    params: TransferParams,
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
        gasDetails = {
          evmGasType: 2 as const,
          gasEstimate,
          maxFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxFeePerGas,
          maxPriorityFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxPriorityFeePerGas,
        };
      } else if (wallet) {
        gasDetails = await getGasDetailsForTransaction(
          engine.getNetwork(),
          gasEstimate,
          sendWithPublicWallet,
          wallet,
          rpcUrl ?? NETWORK_CONFIG.RPC_URL
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

      const response = await populateProvedTransfer(
        engine.getTxidVersion(),
        engine.getNetwork(),
        params.senderWalletID,
        true,
        params.memo ?? "",
        recipients,
        [],
        broadcasterFee,
        sendWithPublicWallet,
        overallBatchMinGasPrice,
        gasDetails
      );

      logger.info("Transfer transaction populated successfully");

      return response.transaction;
    } catch (error) {
      logger.error("Failed to populate transfer", error);
      throw new TransactionError(`Transfer population failed: ${error}`);
    }
  }

  async executeTransfer(
    params: TransferParams,
    wallet?: Wallet | HDNodeWallet,
    mode: TransactionMode,
    broadcaster?: SelectedBroadcaster,
    rpcUrl?: string,
    progressCallback?: (progress: number) => void
  ): Promise<{ transaction: any; gasEstimate: bigint; broadcasterFee?: RailgunERC20AmountRecipient }> {
    const sendWithPublicWallet = mode === "self_signing";

    const gasEstimate = await this.estimateTransferGas(
      params,
      sendWithPublicWallet,
      undefined,
      rpcUrl
    );

    let broadcasterFee: RailgunERC20AmountRecipient | undefined;

    if (!sendWithPublicWallet) {
      const gasDetails = {
        evmGasType: 2 as const, // Type2 (EIP-1559)
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
      broadcasterFee,
      progressCallback
    );

    const transaction = await this.populateTransfer(
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

  private formatRecipients(params: TransferParams): RailgunERC20AmountRecipient[] {
    return [{
      tokenAddress: params.tokenAddress,
      amount: params.amount,
      recipientAddress: params.recipientRailgunAddress,
    }];
  }
}

export const transferService = new TransferService();
