import { NetworkName, RailgunERC20AmountRecipient } from "@railgun-community/shared-models";
import { keccak256 } from "ethers";
import { ethers } from "ethers";
import { getShieldPrivateKeySignatureMessage } from "@railgun-community/wallet";
import {
  gasEstimateForShield,
  gasEstimateForShieldBaseToken,
  populateShield,
  populateShieldBaseToken,
} from "@railgun-community/wallet";
import type { Wallet, HDNodeWallet } from "ethers";
import { Contract } from "ethers";
import { engine } from "../core/engine";
import { NETWORK_CONFIG } from "../utils/config";
import { getShieldSignature, getGasDetailsForTransaction, serializeERC20Transfer } from "../utils/gas";
import { createLogger } from "../utils/logger";
import { TransactionError, GasEstimationError } from "../utils/errors";
import type { ShieldParams } from "../core/types";

const logger = createLogger("ShieldService");

export class ShieldService {
  async estimateShieldGas(
    fromWalletAddress: string,
    recipients: RailgunERC20AmountRecipient[]
  ): Promise<bigint> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      const shieldPrivateKey = await this.generateShieldPrivateKey();

      const { gasEstimate } = await gasEstimateForShield(
        engine.getTxidVersion(),
        engine.getNetwork(),
        shieldPrivateKey,
        recipients,
        [],
        fromWalletAddress
      );

      logger.debug(`Shield gas estimate: ${gasEstimate}`);
      return gasEstimate;
    } catch (error) {
      logger.error("Failed to estimate shield gas", error);
      throw new GasEstimationError(`Gas estimation failed: ${error}`);
    }
  }

  async approveTokens(
    wallet: Wallet | HDNodeWallet,
    recipients: RailgunERC20AmountRecipient[]
  ): Promise<void> {
    const spender = NETWORK_CONFIG.PROXY_CONTRACT;

    // Group by token address to handle multiple recipients of same token
    const requiredAllowances = new Map<string, bigint>();
    for (const recipient of recipients) {
      const current = requiredAllowances.get(recipient.tokenAddress) || 0n;
      requiredAllowances.set(recipient.tokenAddress, current + recipient.amount);
    }

    for (const [tokenAddress, requiredAmount] of requiredAllowances.entries()) {
      try {
        const contract = new Contract(
          tokenAddress,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) external returns (bool)",
          ],
          wallet
        );

        const allowance = await contract.allowance(
          wallet.address,
          spender
        );

        if (allowance >= requiredAmount) {
          logger.info(`Token ${tokenAddress} already has sufficient allowance: ${allowance.toString()}`);
          continue;
        }

        logger.info(`Approving token ${tokenAddress} for RAILGUN proxy (Required: ${requiredAmount.toString()}, Current: ${allowance.toString()})`);
        const tx = await contract.approve(spender, ethers.MaxUint256);
        await tx.wait();

        logger.info(`Approved token ${tokenAddress} for RAILGUN proxy`);
      } catch (error) {
        logger.error(`Failed to approve token ${tokenAddress}`, error);
        throw new TransactionError(`Token approval failed: ${error}`);
      }
    }
  }

  async shieldERC20(
    fromAddress: string,
    wallet: Wallet | HDNodeWallet,
    recipients: RailgunERC20AmountRecipient[],
    sendWithPublicWallet: boolean,
    rpcUrl?: string
  ): Promise<{ transaction: any; gasEstimate: bigint; nullifiers: string[] }> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      logger.info(`Shielding ${recipients.length} ERC20 transfer(s)`);

      await this.approveTokens(wallet, recipients);

      const gasEstimate = await this.estimateShieldGas(fromAddress, recipients);

      const shieldPrivateKey = await this.generateShieldPrivateKey();

      const gasDetails = await getGasDetailsForTransaction(
        engine.getNetwork(),
        gasEstimate,
        sendWithPublicWallet,
        wallet,
        rpcUrl
      );

      const { transaction, nullifiers } = await populateShield(
        engine.getTxidVersion(),
        engine.getNetwork(),
        shieldPrivateKey,
        recipients,
        [],
        gasDetails
      );

      logger.info("Shield transaction populated successfully");
      logger.debug(`Nullifiers: ${nullifiers}`);

      return {
        transaction,
        gasEstimate,
        nullifiers: nullifiers ?? [],
      };
    } catch (error) {
      logger.error("Failed to shield ERC20", error);
      throw new TransactionError(`Shield failed: ${error}`);
    }
  }

  async shieldERC20WithGasSponsor(
    fromAddress: string,
    wallet: Wallet | HDNodeWallet,
    recipients: RailgunERC20AmountRecipient[],
    sendWithPublicWallet: boolean,
    rpcUrl?: string
  ): Promise<{ transaction: any; gasEstimate: bigint; nullifiers: string[] }> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      logger.info(`Shielding ${recipients.length} ERC20 transfer(s) via GasSponsor`);

      const gasEstimate = await this.estimateShieldGas(fromAddress, recipients);

      const shieldPrivateKey = await this.generateShieldPrivateKey();

      const gasDetails = await getGasDetailsForTransaction(
        engine.getNetwork(),
        gasEstimate,
        sendWithPublicWallet,
        wallet,
        rpcUrl
      );

      const { transaction, nullifiers } = await populateShield(
        engine.getTxidVersion(),
        engine.getNetwork(),
        shieldPrivateKey,
        recipients,
        [],
        gasDetails
      );

      const railgunInterface = new ethers.Interface([
        "function shield(address token,uint256 amount,bytes encryptedNote,address railgunAddress,address optionalRecipient)",
      ]);

      const gasSponsorInterface = new ethers.Interface([
        "function shield(address token,uint256 amount,bytes encryptedNote)",
      ]);

      const decoded = railgunInterface.decodeFunctionData(
        "shield",
        transaction.data
      );

      const sponsoredTransaction = {
        to: NETWORK_CONFIG.GAS_SPONSOR_ADDRESS,
        data: gasSponsorInterface.encodeFunctionData("shield", [
          decoded[0],
          decoded[1],
          decoded[2],
        ]),
        value: 0n,
      };

      logger.info("GasSponsor shield transaction populated successfully");

      return {
        transaction: sponsoredTransaction,
        gasEstimate,
        nullifiers: nullifiers ?? [],
      };
    } catch (error) {
      logger.error("Failed to shield ERC20 with GasSponsor", error);
      throw new TransactionError(`GasSponsor shield failed: ${error}`);
    }
  }

  async shieldBaseToken(
    wallet: Wallet | HDNodeWallet,
    recipient: RailgunERC20AmountRecipient,
    sendWithPublicWallet: boolean,
    rpcUrl?: string
  ): Promise<{ transaction: any; gasEstimate: bigint }> {
    if (!engine.isReady()) {
      throw new TransactionError("Engine not initialized");
    }

    try {
      logger.info(`Shielding base token`);

      const shieldPrivateKey = await this.generateShieldPrivateKey();

      const { gasEstimate } = await gasEstimateForShieldBaseToken(
        engine.getTxidVersion(),
        engine.getNetwork(),
        recipient.recipientAddress,
        shieldPrivateKey,
        recipient,
        wallet.address
      );

      const gasDetails = await getGasDetailsForTransaction(
        engine.getNetwork(),
        gasEstimate,
        sendWithPublicWallet,
        wallet,
        rpcUrl
      );

      const { transaction } = await populateShieldBaseToken(
        engine.getTxidVersion(),
        engine.getNetwork(),
        recipient.recipientAddress,
        shieldPrivateKey,
        recipient,
        gasDetails
      );

      logger.info("Base token shield transaction populated successfully");

      return {
        transaction,
        gasEstimate,
      };
    } catch (error) {
      logger.error("Failed to shield base token", error);
      throw new TransactionError(`Base token shield failed: ${error}`);
    }
  }

  private async generateShieldPrivateKey(): Promise<string> {
    const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
    return keccak256(ethers.toUtf8Bytes(shieldSignatureMessage));
  }
}

export const shieldService = new ShieldService();
