// Wallet Core Implementation
// Handles wallet creation, import, and key management using ethers.js

import { HDNodeWallet, Mnemonic } from 'ethers'

// Network configurations
export const NETWORKS = {
  ethereum: {
    chainId: '0x1',
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  sepolia: {
    chainId: '0xaa36a7',
    name: 'Sepolia Testnet',
    rpcUrl: 'https://sepolia.drpc.org',
    nativeCurrency: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  polygon: {
    chainId: '0x89',
    name: 'Polygon Mainnet',
    rpcUrl: 'https://polygon.drpc.org',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
  },
}

// Token addresses
export const TOKEN_ADDRESSES = {
  sepolia: {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    USDT: '0x7169c38647a5A414414BfC4bE921bf2C0e2a8510',
    DAI: '0x68194a729C245C1b196bd751B4E81bfeAB538c56',
  },
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  polygon: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  },
}

export interface WalletInfo {
  mnemonic: string
  addresses: string[]
  privateKeys: Record<string, string> // indexed by address
  railgunWalletID?: string
}

export interface CreateWalletOptions {
  password: string
  numAccounts?: number
}

export interface ImportWalletOptions {
  mnemonic: string
  password: string
  numAccounts?: number
}

class WalletCore {
  /**
   * Create a new wallet with a randomly generated mnemonic
   */
  async createWallet(options: CreateWalletOptions): Promise<WalletInfo> {
    const { password, numAccounts = 1 } = options

    // Generate random entropy and create mnemonic
    const entropy = crypto.getRandomValues(new Uint8Array(16)) // 128 bits = 12 words
    const mnemonic = Mnemonic.fromEntropy(entropy).phrase

    // Derive addresses
    const walletInfo = await this.deriveWalletFromMnemonic(mnemonic, numAccounts)

    // Save encrypted wallet
    // This will be handled by the storage module

    return walletInfo
  }

  /**
   * Import wallet from existing mnemonic phrase
   */
  async importWallet(options: ImportWalletOptions): Promise<WalletInfo> {
    const { mnemonic, password, numAccounts = 1 } = options

    // Validate mnemonic
    if (!Mnemonic.isValidMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase')
    }

    // Derive addresses
    const walletInfo = await this.deriveWalletFromMnemonic(mnemonic, numAccounts)

    return walletInfo
  }

  /**
   * Derive multiple addresses from mnemonic using HD derivation
   */
  private async deriveWalletFromMnemonic(
    mnemonic: string,
    numAccounts: number
  ): Promise<WalletInfo> {
    const addresses: string[] = []
    const privateKeys: Record<string, string> = {}

    // For each account index, create wallet directly with the full path
    for (let i = 0; i < numAccounts; i++) {
      // Create wallet at path m/44'/60'/0'/0/i (Ethereum BIP44 standard)
      // ethers v6: specify the full path when creating the wallet
      const path = `m/44'/60'/0'/0/${i}`
      const wallet = HDNodeWallet.fromPhrase(mnemonic, '', path)

      const address = wallet.address
      const privateKey = wallet.privateKey

      addresses.push(address)
      privateKeys[address] = privateKey
    }

    return {
      mnemonic,
      addresses,
      privateKeys,
    }
  }

  /**
   * Sign a transaction with the given private key
   */
  async signTransaction(privateKey: string, txData: any): Promise<string> {
    const wallet = new HDNodeWallet(privateKey)
    const signedTx = await wallet.signTransaction(txData)
    return signedTx
  }

  /**
   * Sign a message with the given private key
   */
  async signMessage(privateKey: string, message: string): Promise<string> {
    const wallet = new HDNodeWallet(privateKey)
    const signature = await wallet.signMessage(message)
    return signature
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(privateKey: string, domain: any, types: any, value: any): Promise<string> {
    const wallet = new HDNodeWallet(privateKey)
    const signature = await wallet.signTypedData(domain, types, value)
    return signature
  }

  /**
   * Get address from private key
   */
  privateKeyToAddress(privateKey: string): string {
    const wallet = new HDNodeWallet(privateKey)
    return wallet.address
  }

  /**
   * Validate if a string is a valid Ethereum address
   */
  isValidAddress(address: string): boolean {
    try {
      return /^0x[a-fA-F0-9]{40}$/.test(address)
    } catch {
      return false
    }
  }

  /**
   * Get network info by chain ID
   */
  getNetworkInfo(chainId: string) {
    const network = Object.values(NETWORKS).find(n => n.chainId.toLowerCase() === chainId.toLowerCase())
    return network || NETWORKS.sepolia // Default to Sepolia
  }

  /**
   * Get RPC URL for network
   */
  getRpcUrl(network: string): string {
    return NETWORKS[network]?.rpcUrl || NETWORKS.sepolia.rpcUrl
  }

  /**
   * Get token address for network
   */
  getTokenAddress(network: string, tokenSymbol: string): string {
    return TOKEN_ADDRESSES[network]?.[tokenSymbol] || ''
  }
}

// Export singleton instance
export const walletCore = new WalletCore()
