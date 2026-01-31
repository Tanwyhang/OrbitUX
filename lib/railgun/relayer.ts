/**
 * Server-side Relayer Service
 *
 * Manages a funded server wallet that pays gas for RAILGUN transactions.
 * Users don't need ETH - the relayer sponsors all gas costs.
 *
 * Security: This wallet can only pay gas, not steal user tokens.
 * Tokens flow from user's approved wallet through RAILGUN contracts.
 */

import { Wallet as EthersWallet, JsonRpcProvider } from "ethers";

// Default RPC URLs for mainnet
const DEFAULT_RPC_URLS: Record<number, string> = {
  42161: "https://arb1.arbitrum.io/rpc", // Arbitrum
  137: "https://polygon-rpc.com", // Polygon
};

class RelayerService {
  private static instance: RelayerService | null = null;
  private wallet: EthersWallet | null = null;
  private provider: JsonRpcProvider | null = null;
  private chainId: number = 42161; // Default to Arbitrum

  private constructor() {}

  static getInstance(): RelayerService {
    if (!RelayerService.instance) {
      RelayerService.instance = new RelayerService();
    }
    return RelayerService.instance;
  }

  /**
   * Set the chain ID for the relayer
   */
  setChainId(chainId: number): void {
    this.chainId = chainId;
    // Clear cached wallet and provider when chain changes
    this.wallet = null;
    this.provider = null;
  }

  /**
   * Get the RPC URL for the current chain
   */
  private getRpcUrl(): string {
    return process.env.RAILGUN_RPC_URL || DEFAULT_RPC_URLS[this.chainId] || DEFAULT_RPC_URLS[42161];
  }

  /**
   * Get the relayer wallet instance.
   * Lazily initializes the wallet from environment variable.
   */
  getWallet(): EthersWallet {
    if (!this.wallet) {
      const privateKey = process.env.RELAYER_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error(
          "RELAYER_PRIVATE_KEY not configured. " +
          "Add a funded wallet private key to .env.local"
        );
      }

      const rpcUrl = this.getRpcUrl();
      this.provider = new JsonRpcProvider(rpcUrl);
      this.wallet = new EthersWallet(privateKey, this.provider);
      console.log('[Relayer] Initialized with address:', this.wallet.address, 'on chain:', this.chainId);
    }
    return this.wallet;
  }

  /**
   * Get the relayer's public address.
   */
  getAddress(): string {
    return this.getWallet().address;
  }

  /**
   * Get the provider instance.
   */
  getProvider(): JsonRpcProvider {
    if (!this.provider) {
      this.getWallet(); // This initializes the provider
    }
    return this.provider!;
  }

  /**
   * Check if relayer is configured.
   */
  isConfigured(): boolean {
    return !!process.env.RELAYER_PRIVATE_KEY;
  }
}

export const relayerService = RelayerService.getInstance();
