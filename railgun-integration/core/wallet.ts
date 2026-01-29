import { NetworkName, NETWORK_CONFIG } from "@railgun-community/shared-models";
import {
  createRailgunWallet,
  loadWalletByID,
  getRailgunAddress,
  pbkdf2,
} from "@railgun-community/wallet";
import { Wallet as EthersWallet, Mnemonic, randomBytes, JsonRpcProvider } from "ethers";
import { engine } from "./engine";
import { createLogger } from "../utils/logger";
import { WalletError } from "../utils/errors";
import type { RailgunWalletInfo } from "../types";
import { NETWORK_CONFIG as APP_NETWORK_CONFIG } from "../utils/config";

const logger = createLogger("WalletService");

/**
 * WalletService handles RAILGUN wallet creation and management.
 * 
 * Uses the correct RAILGUN Wallet SDK API:
 * - createRailgunWallet(encryptionKey, mnemonic, creationBlockNumbers)
 * - loadWalletByID(encryptionKey, walletID, isViewOnly)
 * - getRailgunAddress(walletID)
 */
export class WalletService {
  /**
   * Create a new RAILGUN wallet with a randomly generated mnemonic.
   * 
   * @param password - Password to derive encryption key
   * @param label - Optional wallet label (not used in new API, kept for compatibility)
   * @returns Wallet info including ID, address, encryption key, and mnemonic
   */
  async createWallet(
    password: string,
    label?: string
  ): Promise<RailgunWalletInfo & { mnemonic: string }> {
    if (!engine.isReady()) {
      throw new WalletError("Engine not initialized");
    }

    try {
      logger.info(`Creating new RAILGUN wallet${label ? ` (${label})` : ""}`);

      // Generate random mnemonic using ethers.js (12 words from 16 bytes entropy)
      const mnemonic = Mnemonic.fromEntropy(randomBytes(16)).phrase.trim();
      
      logger.debug(`Generated ${mnemonic.split(" ").length}-word mnemonic`);

      const encryptionKey = await this.deriveEncryptionKey(password);
      
      // Get creation block number for current network
      const networkName = APP_NETWORK_CONFIG.NETWORK;
      const networkConfig = NETWORK_CONFIG[networkName];
      const deploymentBlock = networkConfig?.deploymentBlock ?? 0;
      
      const creationBlockNumbers: { [key: string]: number } = {
        [networkName]: deploymentBlock,
      };

      // Use the correct RAILGUN SDK API
      const walletInfo = await createRailgunWallet(
        encryptionKey,
        mnemonic,
        creationBlockNumbers as Record<NetworkName, number>
      );

      // Get the RAILGUN address
      const railgunAddress = getRailgunAddress(walletInfo.id) ?? "";

      const result = {
        walletID: walletInfo.id,
        railgunAddress,
        encryptionKey,
        mnemonic,
      };

      logger.info(`Created RAILGUN wallet: ${walletInfo.id}`);
      logger.debug(`Railgun address: ${railgunAddress}`);

      return result;
    } catch (error) {
      logger.error("Failed to create RAILGUN wallet", error);
      throw new WalletError(`Wallet creation failed: ${error}`);
    }
  }

  /**
   * Create or restore a RAILGUN wallet from an existing mnemonic.
   * 
   * @param mnemonic - 12 or 24 word mnemonic phrase
   * @param password - Password to derive encryption key
   * @param label - Optional wallet label
   * @returns Wallet info including ID, address, and encryption key
   */
  async createWalletFromMnemonic(
    mnemonic: string,
    password: string,
    label?: string
  ): Promise<RailgunWalletInfo> {
    if (!engine.isReady()) {
      throw new WalletError("Engine not initialized");
    }

    try {
      logger.info(`Restoring RAILGUN wallet from mnemonic${label ? ` (${label})` : ""}`);

      // Validate mnemonic word count
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        throw new WalletError(`Invalid mnemonic: expected 12 or 24 words, got ${wordCount}`);
      }

      const encryptionKey = await this.deriveEncryptionKey(password);
      
      // Get creation block number for current network
      const networkName = APP_NETWORK_CONFIG.NETWORK;
      const networkConfig = NETWORK_CONFIG[networkName];
      const deploymentBlock = networkConfig?.deploymentBlock ?? 0;
      
      const creationBlockNumbers: { [key: string]: number } = {
        [networkName]: deploymentBlock,
      };

      // Use the correct RAILGUN SDK API
      const walletInfo = await createRailgunWallet(
        encryptionKey,
        mnemonic.trim(),
        creationBlockNumbers as Record<NetworkName, number>
      );

      // Get the RAILGUN address
      const railgunAddress = getRailgunAddress(walletInfo.id) ?? "";

      const result: RailgunWalletInfo = {
        walletID: walletInfo.id,
        railgunAddress,
        encryptionKey,
      };

      logger.info(`Restored RAILGUN wallet: ${walletInfo.id}`);
      logger.debug(`Railgun address: ${railgunAddress}`);

      return result;
    } catch (error) {
      logger.error("Failed to restore RAILGUN wallet", error);
      throw new WalletError(`Wallet restoration failed: ${error}`);
    }
  }

  /**
   * Load an existing RAILGUN wallet by ID.
   * 
   * @param walletID - The wallet ID to load
   * @param password - Password to derive encryption key
   * @returns Wallet info
   */
  async loadWallet(
    walletID: string,
    password: string
  ): Promise<RailgunWalletInfo> {
    if (!engine.isReady()) {
      throw new WalletError("Engine not initialized");
    }

    try {
      logger.info(`Loading RAILGUN wallet: ${walletID}`);

      const encryptionKey = await this.deriveEncryptionKey(password);
      
      const walletInfo = await loadWalletByID(
        encryptionKey,
        walletID,
        false // isViewOnlyWallet
      );

      const railgunAddress = getRailgunAddress(walletInfo.id) ?? "";

      const result: RailgunWalletInfo = {
        walletID: walletInfo.id,
        railgunAddress,
        encryptionKey,
      };

      logger.info(`Loaded RAILGUN wallet: ${walletInfo.id}`);

      return result;
    } catch (error) {
      logger.error(`Failed to load RAILGUN wallet: ${walletID}`, error);
      throw new WalletError(`Wallet loading failed: ${error}`);
    }
  }

  /**
   * Get the RAILGUN address for a wallet by ID.
   */
  async getWalletAddress(walletID: string): Promise<string> {
    if (!engine.isReady()) {
      throw new WalletError("Engine not initialized");
    }

    try {
      const railgunAddress = getRailgunAddress(walletID);

      if (!railgunAddress) {
        throw new WalletError(`No address found for wallet: ${walletID}`);
      }

      return railgunAddress;
    } catch (error) {
      logger.error(`Failed to get wallet address for: ${walletID}`, error);
      throw new WalletError(`Failed to get wallet address: ${error}`);
    }
  }

  /**
   * Derive encryption key from password using PBKDF2.
   * Uses a deterministic salt derived from the password for reproducibility.
   */
  private async deriveEncryptionKey(password: string): Promise<string> {
    const passwordBytes = new TextEncoder().encode(password);
    const passwordArray = Array.from(passwordBytes);
    const paddedArray = passwordArray
      .slice(0, 16)
      .concat(Array(Math.max(0, 16 - passwordArray.length)).fill(0));
    const saltHex = paddedArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    
    const encryptionKey = await pbkdf2(password, saltHex, 100000);
    return encryptionKey;
  }

  /**
   * Create a public Ethereum wallet for gas payments.
   */
  createPublicWallet(privateKey: string, rpcUrl?: string): EthersWallet {
    try {
      if (rpcUrl) {
        const provider = new JsonRpcProvider(rpcUrl);
        return new EthersWallet(privateKey, provider);
      }
      return new EthersWallet(privateKey);
    } catch (error) {
      logger.error("Failed to create public wallet", error);
      throw new WalletError(`Public wallet creation failed: ${error}`);
    }
  }
}

export const walletService = new WalletService();
