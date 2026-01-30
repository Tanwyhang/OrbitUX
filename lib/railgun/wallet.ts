/**
 * Server-side RAILGUN Wallet Service
 * 
 * Handles wallet creation and management for API routes.
 */

import { NetworkName, NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG } from "@railgun-community/shared-models";
import {
  createRailgunWallet,
  loadWalletByID,
  getRailgunAddress,
  pbkdf2,
} from "@railgun-community/wallet";
import { railgunEngine } from "./engine";
import type { RailgunWalletInfo } from "./types";

class RailgunWalletService {
  private static instance: RailgunWalletService | null = null;
  
  // Cache wallet IDs to avoid re-creating
  private walletCache = new Map<string, RailgunWalletInfo>();

  private constructor() {}

  static getInstance(): RailgunWalletService {
    if (!RailgunWalletService.instance) {
      RailgunWalletService.instance = new RailgunWalletService();
    }
    return RailgunWalletService.instance;
  }

  /**
   * Create or restore a RAILGUN wallet from mnemonic.
   */
  async createWalletFromMnemonic(
    mnemonic: string,
    password: string
  ): Promise<RailgunWalletInfo> {
    if (!railgunEngine.isReady()) {
      throw new Error("RAILGUN engine not initialized");
    }

    // Check cache first (based on mnemonic hash)
    const cacheKey = this.getCacheKey(mnemonic, password);
    const cached = this.walletCache.get(cacheKey);
    if (cached) {
      console.log('[RAILGUN Wallet] Returning cached wallet:', cached.walletID);
      return cached;
    }

    try {
      console.log('[RAILGUN Wallet] Creating wallet from mnemonic...');

      // Validate mnemonic
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        throw new Error(`Invalid mnemonic: expected 12 or 24 words, got ${wordCount}`);
      }

      const encryptionKey = await this.deriveEncryptionKey(password);
      
      // Get creation block for network
      const networkName = railgunEngine.getNetwork();
      const networkConfig = RAILGUN_NETWORK_CONFIG[networkName];
      const deploymentBlock = networkConfig?.deploymentBlock ?? 0;
      
      const creationBlockNumbers: Record<NetworkName, number> = {
        [networkName]: deploymentBlock,
      } as Record<NetworkName, number>;

      const walletInfo = await createRailgunWallet(
        encryptionKey,
        mnemonic.trim(),
        creationBlockNumbers
      );

      const railgunAddress = getRailgunAddress(walletInfo.id) ?? "";

      const result: RailgunWalletInfo = {
        walletID: walletInfo.id,
        railgunAddress,
        encryptionKey,
      };

      // Cache the result
      this.walletCache.set(cacheKey, result);

      console.log('[RAILGUN Wallet] Created wallet:', walletInfo.id);
      console.log('[RAILGUN Wallet] Address:', railgunAddress.slice(0, 30) + '...');

      return result;
    } catch (error) {
      console.error('[RAILGUN Wallet] Creation failed:', error);
      throw error;
    }
  }

  /**
   * Load an existing wallet by ID.
   */
  async loadWallet(walletID: string, password: string): Promise<RailgunWalletInfo> {
    if (!railgunEngine.isReady()) {
      throw new Error("RAILGUN engine not initialized");
    }

    try {
      console.log('[RAILGUN Wallet] Loading wallet:', walletID);

      const encryptionKey = await this.deriveEncryptionKey(password);
      
      const walletInfo = await loadWalletByID(
        encryptionKey,
        walletID,
        false // isViewOnlyWallet
      );

      const railgunAddress = getRailgunAddress(walletInfo.id) ?? "";

      return {
        walletID: walletInfo.id,
        railgunAddress,
        encryptionKey,
      };
    } catch (error) {
      console.error('[RAILGUN Wallet] Load failed:', error);
      throw error;
    }
  }

  /**
   * Get RAILGUN address for a wallet.
   */
  getWalletAddress(walletID: string): string | null {
    return getRailgunAddress(walletID) ?? null;
  }

  /**
   * Derive encryption key from password using PBKDF2.
   */
  async deriveEncryptionKey(password: string): Promise<string> {
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
   * Create a cache key from mnemonic + password.
   */
  private getCacheKey(mnemonic: string, password: string): string {
    // Simple hash - in production use crypto
    const combined = mnemonic.trim() + '|' + password;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Clear wallet cache (for testing).
   */
  clearCache(): void {
    this.walletCache.clear();
  }
}

export const railgunWallet = RailgunWalletService.getInstance();
