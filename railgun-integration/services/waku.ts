import {
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG,
  NetworkName,
  type Chain,
  type SelectedBroadcaster,
  type FeeTokenDetails,
  type TransactionGasDetails,
  type RailgunERC20AmountRecipient,
} from "@railgun-community/shared-models";
import { calculateBroadcasterFeeERC20Amount } from "@railgun-community/wallet";
import { engine } from "../core/engine";
import { createLogger } from "../utils/logger";
import { BroadcasterError } from "../utils/errors";

const logger = createLogger("WakuService");

// Dynamic import for Waku module (Node environment)
const wakuModule = import("@railgun-community/waku-broadcaster-client-node");

let WakuBroadcasterClient: any;
let BroadcasterTransaction: any;
let wakuInstance: any;
let isWakuConnected = false;

/**
 * WakuService provides integration with the Waku Broadcaster network
 * for submitting private transactions without exposing your public address.
 */
export class WakuService {
  /**
   * Initialize and start Waku Broadcaster Client connection.
   * Must be called before finding broadcasters or submitting transactions.
   */
  async initialize(network?: NetworkName): Promise<void> {
    if (isWakuConnected) {
      logger.warn("Waku already connected");
      return;
    }

    if (!engine.isReady()) {
      throw new BroadcasterError("Engine must be initialized before Waku");
    }

    try {
      logger.info("Initializing Waku Broadcaster Client...");

      // Load the Waku module dynamically
      if (!wakuInstance) {
        wakuInstance = await wakuModule;
      }

      WakuBroadcasterClient = wakuInstance.WakuBroadcasterClient;
      BroadcasterTransaction = wakuInstance.BroadcasterTransaction;

      const selectedNetwork = network ?? engine.getNetwork();
      const { chain } = RAILGUN_NETWORK_CONFIG[selectedNetwork];

      const options = {};

      const statusCallback = (chain: Chain, status: string) => {
        logger.info(`[Waku] ${chain.id}:${chain.type} - Status: ${status}`);
        if (status === "Connected") {
          isWakuConnected = true;
        }
      };

      const debugLogger = {
        log: (msg: string) => {
          logger.debug(`[Waku] ${msg}`);
        },
        error: (error: Error) => {
          logger.error("[Waku] Error:", error);
        },
      };

      await WakuBroadcasterClient.start(chain, options, statusCallback, debugLogger);

      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 3000));

      isWakuConnected = true;
      logger.info("Waku Broadcaster Client connected successfully");
    } catch (error) {
      logger.error("Failed to initialize Waku", error);
      throw new BroadcasterError(`Waku initialization failed: ${error}`);
    }
  }

  /**
   * Find the best broadcaster for a specific token on the network.
   */
  async findBestBroadcaster(
    tokenAddress: string,
    useRelayAdapt: boolean = false,
    network?: NetworkName
  ): Promise<SelectedBroadcaster | null> {
    if (!WakuBroadcasterClient) {
      throw new BroadcasterError("Waku not initialized. Call initialize() first.");
    }

    try {
      logger.info(`Finding best broadcaster for token: ${tokenAddress}`);

      const selectedNetwork = network ?? engine.getNetwork();
      const { chain } = RAILGUN_NETWORK_CONFIG[selectedNetwork];

      const broadcaster = WakuBroadcasterClient.findBestBroadcaster(
        chain,
        tokenAddress,
        useRelayAdapt
      );

      if (!broadcaster) {
        logger.warn(`No broadcaster found for token: ${tokenAddress}`);
        return null;
      }

      logger.info(`Found broadcaster:`, {
        railgunAddress: broadcaster.railgunAddress,
        tokenAddress: broadcaster.tokenAddress,
        feePerUnitGas: broadcaster.tokenFee.feePerUnitGas,
      });

      return broadcaster;
    } catch (error) {
      logger.error("Failed to find broadcaster", error);
      throw new BroadcasterError(`Failed to find broadcaster: ${error}`);
    }
  }

  /**
   * Get fee token details for broadcaster transactions.
   */
  getFeeTokenDetails(broadcaster: SelectedBroadcaster): FeeTokenDetails {
    return {
      tokenAddress: broadcaster.tokenAddress,
      feePerUnitGas: BigInt(broadcaster.tokenFee.feePerUnitGas),
    };
  }

  /**
   * Calculate the broadcaster fee for a transaction.
   */
  calculateBroadcasterFee(
    broadcaster: SelectedBroadcaster,
    estimatedGasDetails: TransactionGasDetails
  ): RailgunERC20AmountRecipient {
    const feeTokenDetails = this.getFeeTokenDetails(broadcaster);

    const feeAmountDetails = calculateBroadcasterFeeERC20Amount(
      feeTokenDetails,
      estimatedGasDetails
    );

    logger.info(`Calculated broadcaster fee: ${feeAmountDetails.amount}`);

    return {
      tokenAddress: feeAmountDetails.tokenAddress,
      amount: feeAmountDetails.amount,
      recipientAddress: broadcaster.railgunAddress,
    };
  }

  /**
   * Submit a populated transaction through the Waku Broadcaster network.
   * This is the key function that maintains privacy - your public address is never exposed.
   */
  async submitTransaction(
    populatedTransaction: {
      to: string;
      data: string;
    },
    nullifiers: string[],
    selectedBroadcaster: SelectedBroadcaster,
    overallBatchMinGasPrice: bigint,
    useRelayAdapt: boolean = false,
    network?: NetworkName
  ): Promise<string> {
    if (!BroadcasterTransaction) {
      throw new BroadcasterError("Waku not initialized. Call initialize() first.");
    }

    try {
      logger.info("Submitting transaction via Waku Broadcaster...");

      const selectedNetwork = network ?? engine.getNetwork();
      const { chain } = RAILGUN_NETWORK_CONFIG[selectedNetwork];

      logger.debug("Transaction details:", {
        to: populatedTransaction.to,
        dataLength: populatedTransaction.data.length,
        broadcasterAddress: selectedBroadcaster.railgunAddress,
        feesID: selectedBroadcaster.tokenFee.feesID,
        nullifiersCount: nullifiers.length,
        minGasPrice: overallBatchMinGasPrice.toString(),
      });

      // Create the broadcaster transaction
      const broadcasterTransaction = await BroadcasterTransaction.create(
        populatedTransaction.to,
        populatedTransaction.data,
        selectedBroadcaster.railgunAddress,
        selectedBroadcaster.tokenFee.feesID,
        chain,
        nullifiers,
        overallBatchMinGasPrice,
        useRelayAdapt
      );

      logger.info("Broadcasting transaction to Waku network...");

      // Send the transaction through the broadcaster
      const txHash = await broadcasterTransaction.send();

      logger.info(`Transaction submitted successfully!`);
      logger.info(`Transaction Hash: ${txHash}`);

      return txHash;
    } catch (error) {
      logger.error("Failed to submit transaction via broadcaster", error);
      throw new BroadcasterError(`Broadcaster transaction failed: ${error}`);
    }
  }

  /**
   * Check if Waku is connected.
   */
  isConnected(): boolean {
    return isWakuConnected;
  }

  /**
   * Disconnect from Waku network.
   */
  async disconnect(): Promise<void> {
    if (WakuBroadcasterClient && isWakuConnected) {
      try {
        await WakuBroadcasterClient.stop();
        isWakuConnected = false;
        logger.info("Waku Broadcaster Client disconnected");
      } catch (error) {
        logger.error("Failed to disconnect Waku", error);
      }
    }
  }
}

export const wakuService = new WakuService();
