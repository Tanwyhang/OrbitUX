// Encrypted Storage Wrapper for Orbit Wallet Extension
// Uses Web Crypto API for secure encryption of wallet data

// Storage interfaces
interface EncryptedWallet {
  mnemonic: string // Encrypted
  privateKeys: Record<string, string> // Encrypted, indexed by address
  railgunWalletID: string // Encrypted
  railgunEncryptionKey: string // Encrypted
}

interface WalletSettings {
  autoLockMinutes: number
  selectedNetwork: 'ethereum' | 'sepolia' | 'polygon'
  defaultToken: string
  notificationsEnabled: boolean
}

interface AccountInfo {
  address: string
  railgunAddress?: string
  index: number
  label: string
}

interface TransactionInfo {
  hash: string
  type: 'public' | 'private'
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  from: string
  to: string
  amount: string
  token: string
}

interface LockState {
  locked: boolean
  lastActivity: number
}

// Storage keys
const STORAGE_KEYS = {
  ENCRYPTED_WALLET: 'encryptedWallet',
  SETTINGS: 'settings',
  ACCOUNTS: 'accounts',
  TRANSACTIONS: 'transactions',
  LOCK_STATE: 'lockState',
  ENCRYPTION_SALT: 'encryptionSalt',
  ENCRYPTION_IV: 'encryptionIV',
}

// Crypto utilities
class CryptoUtils {
  // Generate a random salt
  static generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16))
  }

  // Generate a random IV (Initialization Vector)
  static generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12))
  }

  // Derive encryption key from password using PBKDF2
  static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(password)

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    )

    // Derive the actual encryption key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  // Encrypt data using AES-GCM
  static async encrypt(
    data: string,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      key,
      dataBuffer
    )

    return {
      encrypted: new Uint8Array(encrypted),
      iv: iv,
    }
  }

  // Decrypt data using AES-GCM
  static async decrypt(
    encryptedData: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<string> {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      key,
      encryptedData as BufferSource
    )

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  }

  // Convert Uint8Array to base64 string for storage
  static uint8ArrayToBase64(data: Uint8Array): string {
    const binary = Array.from(data, byte => String.fromCharCode(byte))
    return btoa(binary.join(''))
  }

  // Convert base64 string to Uint8Array
  static base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64)
    return new Uint8Array(Array.from(binary, char => char.charCodeAt(0)))
  }
}

// Storage wrapper class
class ExtensionStorage {
  // Store encrypted wallet data
  static async saveEncryptedWallet(
    walletData: EncryptedWallet,
    password: string
  ): Promise<boolean> {
    try {
      // Generate or retrieve salt and IV
      let salt: Uint8Array
      let iv: Uint8Array

      const existingSalt = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTION_SALT)
      if (existingSalt[STORAGE_KEYS.ENCRYPTION_SALT]) {
        salt = CryptoUtils.base64ToUint8Array(existingSalt[STORAGE_KEYS.ENCRYPTION_SALT])
        iv = CryptoUtils.generateIV()
      } else {
        salt = CryptoUtils.generateSalt()
        iv = CryptoUtils.generateIV()

        // Store salt for future use
        await chrome.storage.local.set({
          [STORAGE_KEYS.ENCRYPTION_SALT]: CryptoUtils.uint8ArrayToBase64(salt),
        })
      }

      // Derive encryption key
      const key = await CryptoUtils.deriveKeyFromPassword(password, salt)

      // Encrypt wallet data
      const walletJSON = JSON.stringify(walletData)
      const { encrypted } = await CryptoUtils.encrypt(walletJSON, key, iv)

      // Store encrypted data
      await chrome.storage.local.set({
        [STORAGE_KEYS.ENCRYPTED_WALLET]: CryptoUtils.uint8ArrayToBase64(encrypted),
        [STORAGE_KEYS.ENCRYPTION_IV]: CryptoUtils.uint8ArrayToBase64(iv),
      })

      return true
    } catch (error) {
      console.error('Error saving encrypted wallet:', error)
      return false
    }
  }

  // Retrieve and decrypt wallet data
  static async getEncryptedWallet(password: string): Promise<EncryptedWallet | null> {
    try {
      const storage = await chrome.storage.local.get([
        STORAGE_KEYS.ENCRYPTED_WALLET,
        STORAGE_KEYS.ENCRYPTION_SALT,
        STORAGE_KEYS.ENCRYPTION_IV,
      ])

      if (!storage[STORAGE_KEYS.ENCRYPTED_WALLET]) {
        return null
      }

      // Retrieve salt, IV, and encrypted data
      const salt = CryptoUtils.base64ToUint8Array(storage[STORAGE_KEYS.ENCRYPTION_SALT])
      const iv = CryptoUtils.base64ToUint8Array(storage[STORAGE_KEYS.ENCRYPTION_IV])
      const encrypted = CryptoUtils.base64ToUint8Array(storage[STORAGE_KEYS.ENCRYPTED_WALLET])

      // Derive decryption key
      const key = await CryptoUtils.deriveKeyFromPassword(password, salt)

      // Decrypt wallet data
      const decryptedJSON = await CryptoUtils.decrypt(encrypted, key, iv)
      const walletData = JSON.parse(decryptedJSON) as EncryptedWallet

      return walletData
    } catch (error) {
      // Provide detailed error information
      if (error instanceof DOMException) {
        if (error.name === 'OperationError') {
          console.error('Decryption failed: Invalid password or corrupted data')
        } else {
          console.error(`Decryption failed: ${error.name} - ${error.message}`)
        }
      } else {
        console.error('Error decrypting wallet:', error)
      }
      return null
    }
  }

  // Save settings
  static async saveSettings(settings: WalletSettings): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: settings,
    })
  }

  // Get settings
  static async getSettings(): Promise<WalletSettings> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
    return (
      storage[STORAGE_KEYS.SETTINGS] || {
        autoLockMinutes: 10,
        selectedNetwork: 'sepolia',
        defaultToken: 'USDC',
        notificationsEnabled: true,
      }
    )
  }

  // Save accounts
  static async saveAccounts(accounts: AccountInfo[]): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.ACCOUNTS]: accounts,
    })
  }

  // Get accounts
  static async getAccounts(): Promise<AccountInfo[]> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.ACCOUNTS)
    return storage[STORAGE_KEYS.ACCOUNTS] || []
  }

  // Add transaction to history
  static async addTransaction(transaction: TransactionInfo): Promise<void> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.TRANSACTIONS)
    const transactions = storage[STORAGE_KEYS.TRANSACTIONS] || []

    transactions.unshift(transaction)

    // Keep only last 100 transactions
    if (transactions.length > 100) {
      transactions.length = 100
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.TRANSACTIONS]: transactions,
    })
  }

  // Get transaction history
  static async getTransactions(): Promise<TransactionInfo[]> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.TRANSACTIONS)
    return storage[STORAGE_KEYS.TRANSACTIONS] || []
  }

  // Update transaction status
  static async updateTransactionStatus(
    hash: string,
    status: 'pending' | 'confirmed' | 'failed'
  ): Promise<void> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.TRANSACTIONS)
    const transactions = storage[STORAGE_KEYS.TRANSACTIONS] || []

    const txIndex = transactions.findIndex((tx: TransactionInfo) => tx.hash === hash)
    if (txIndex !== -1) {
      transactions[txIndex].status = status
      await chrome.storage.local.set({
        [STORAGE_KEYS.TRANSACTIONS]: transactions,
      })
    }
  }

  // Get lock state
  static async getLockState(): Promise<LockState> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.LOCK_STATE)
    return (
      storage[STORAGE_KEYS.LOCK_STATE] || {
        locked: true,
        lastActivity: Date.now(),
      }
    )
  }

  // Set lock state
  static async setLockState(lockState: LockState): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LOCK_STATE]: lockState,
    })
  }

  // Check if wallet exists
  static async walletExists(): Promise<boolean> {
    const storage = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTED_WALLET)
    return !!storage[STORAGE_KEYS.ENCRYPTED_WALLET]
  }

  // Clear all data (for reset/debugging)
  static async clearAll(): Promise<void> {
    await chrome.storage.local.clear()
    await chrome.storage.session.clear()
  }
}

export { ExtensionStorage, CryptoUtils }
export type {
  EncryptedWallet,
  WalletSettings,
  AccountInfo,
  TransactionInfo,
  LockState,
}
