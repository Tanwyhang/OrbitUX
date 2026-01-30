// Background Service Worker for Orbit Wallet Extension
// This service worker runs in the background and manages:
// - Wallet state (encrypted keys, accounts, settings)
// - Transaction queue and monitoring
// - Cross-context communication (popup, content scripts)
// - RAILGUN API integration (hybrid approach)

import { walletCore } from './wallet-core'
import { getRPCClient, TransactionBuilder } from './rpc-client'
import { railgunAPI } from './railgun-api'
import { ExtensionStorage } from './storage'

console.log('Orbit Wallet background service worker initialized')

// Storage keys
const STORAGE_KEYS = {
  SETTINGS: 'settings',
  ACCOUNTS: 'accounts',
  TRANSACTIONS: 'transactions',
  LOCK_STATE: 'lockState',
}

// Decrypted wallet in memory (cleared on lock)
let inMemoryWallet: {
  mnemonic: string
  privateKeys: Record<string, string>
  addresses: string[]
} | null = null

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details.reason)

  if (details.reason === 'install') {
    // First-time installation
    await initializeStorage()
  } else if (details.reason === 'update') {
    // Extension updated
    console.log('Extension updated to version:', chrome.runtime.getManifest().version)
  }
})

// Initialize default storage values
async function initializeStorage() {
  const settings = {
    autoLockMinutes: 10,
    selectedNetwork: 'sepolia', // Default to Sepolia testnet for demo
    defaultToken: 'USDC',
    notificationsEnabled: true,
  }

  await ExtensionStorage.saveSettings(settings as any)
  await ExtensionStorage.saveAccounts([])
  await ExtensionStorage.setLockState({
    locked: true,
    lastActivity: Date.now(),
  })

  console.log('Storage initialized with defaults')
}

// Auto-lock alarm
chrome.alarms.create('autoLock', { delayInMinutes: 10 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoLock') {
    await lockWallet()
  }
})

// Lock wallet function
async function lockWallet() {
  const lockState = {
    locked: true,
    lastActivity: Date.now(),
  }

  await ExtensionStorage.setLockState(lockState)
  await chrome.storage.session.clear()

  // Clear in-memory wallet
  inMemoryWallet = null

  console.log('Wallet locked due to inactivity')

  // Reset alarm
  chrome.alarms.create('autoLock', { delayInMinutes: 10 })
}

// Reset auto-lock timer on user activity
async function resetAutoLockTimer() {
  chrome.alarms.clear('autoLock')
  chrome.alarms.create('autoLock', { delayInMinutes: 10 })
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type)

  switch (message.type) {
    case 'GET_WALLET_STATE':
      handleGetWalletState(sendResponse)
      return true // Async response

    case 'UNLOCK_WALLET':
      handleUnlockWallet(message.password, sendResponse)
      return true

    case 'CREATE_WALLET':
      handleCreateWallet(message.data, sendResponse)
      return true

    case 'IMPORT_WALLET':
      handleImportWallet(message.data, sendResponse)
      return true

    case 'SEND_TRANSACTION':
      handleSendTransaction(message.data, sendResponse)
      return true

    case 'PRIVATE_TRANSFER':
      handlePrivateTransfer(message.data, sendResponse)
      return true

    case 'USER_ACTIVITY':
      resetAutoLockTimer()
      sendResponse({ success: true })
      break

    case 'GET_BALANCE':
      handleGetBalance(message.data, sendResponse)
      return true

    case 'SWITCH_NETWORK':
      handleSwitchNetwork(message.network, sendResponse)
      return true

    case 'RPC_REQUEST':
      handleRPCRequest(message, sender, sendResponse)
      return true

    default:
      sendResponse({ error: 'Unknown message type' })
  }
})

// Handler functions
async function handleGetWalletState(sendResponse: (response: any) => void) {
  try {
    const [lockState, accounts, settings] = await Promise.all([
      ExtensionStorage.getLockState(),
      ExtensionStorage.getAccounts(),
      ExtensionStorage.getSettings(),
    ])

    sendResponse({
      success: true,
      lockState,
      accounts,
      settings,
    })
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handleUnlockWallet(password: string, sendResponse: (response: any) => void) {
  try {
    // Get encrypted wallet
    const encryptedWallet = await ExtensionStorage.getEncryptedWallet(password)

    if (!encryptedWallet) {
      sendResponse({ success: false, error: 'No wallet found. Create or import a wallet first.' })
      return
    }

    // Store in memory
    inMemoryWallet = {
      mnemonic: encryptedWallet.mnemonic,
      privateKeys: encryptedWallet.privateKeys,
      addresses: encryptedWallet.addresses,
    }

    // Update lock state
    await ExtensionStorage.setLockState({ locked: false, lastActivity: Date.now() })
    await chrome.storage.session.set({ unlocked: true, unlockedAt: Date.now() })

    sendResponse({ success: true })
  } catch (error: any) {
    sendResponse({ success: false, error: 'Incorrect password' })
  }
}

async function handleCreateWallet(data: { password: string }, sendResponse: (response: any) => void) {
  try {
    const { password } = data

    // Create wallet using wallet core
    const walletInfo = await walletCore.createWallet({
      password,
      numAccounts: 1,
    })

    // Save encrypted wallet
    const saved = await ExtensionStorage.saveEncryptedWallet(walletInfo, password)

    if (!saved) {
      sendResponse({ success: false, error: 'Failed to save wallet' })
      return
    }

    // Create account info
    const accounts = walletInfo.addresses.map((address, index) => ({
      address,
      index,
      label: `Account ${index + 1}`,
    }))

    await ExtensionStorage.saveAccounts(accounts)

    // Store in memory
    inMemoryWallet = walletInfo

    // Unlock
    await ExtensionStorage.setLockState({ locked: false, lastActivity: Date.now() })

    sendResponse({
      success: true,
      mnemonic: walletInfo.mnemonic,
      accounts,
    })
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handleImportWallet(data: { mnemonic: string; password: string }, sendResponse: (response: any) => void) {
  try {
    const { mnemonic, password } = data

    // Import wallet using wallet core
    const walletInfo = await walletCore.importWallet({
      mnemonic,
      password,
      numAccounts: 1,
    })

    // Save encrypted wallet
    const saved = await ExtensionStorage.saveEncryptedWallet(walletInfo, password)

    if (!saved) {
      sendResponse({ success: false, error: 'Failed to save wallet' })
      return
    }

    // Create account info
    const accounts = walletInfo.addresses.map((address, index) => ({
      address,
      index,
      label: `Account ${index + 1}`,
    }))

    await ExtensionStorage.saveAccounts(accounts)

    // Store in memory
    inMemoryWallet = walletInfo

    // Unlock
    await ExtensionStorage.setLockState({ locked: false, lastActivity: Date.now() })

    sendResponse({
      success: true,
      accounts,
    })
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handleSendTransaction(data: any, sendResponse: (response: any) => void) {
  try {
    if (!inMemoryWallet) {
      sendResponse({ success: false, error: 'Wallet is locked' })
      return
    }

    const settings = await ExtensionStorage.getSettings()
    const network = settings.selectedNetwork || 'sepolia'

    // Get private key for sender
    const privateKey = inMemoryWallet.privateKeys[data.from]
    if (!privateKey) {
      sendResponse({ success: false, error: 'Private key not found' })
      return
    }

    // Build transaction
    const txParams = await TransactionBuilder.buildTransaction(data, network)

    // Sign transaction
    const signedTx = await walletCore.signTransaction(privateKey, txParams)

    // Broadcast transaction
    const rpcClient = getRPCClient(network)
    const txHash = await rpcClient.sendRawTransaction(signedTx)

    // Add to transaction history
    await ExtensionStorage.addTransaction({
      hash: txHash,
      type: 'public',
      timestamp: Date.now(),
      status: 'pending',
      from: data.from,
      to: data.to,
      amount: data.value || '0',
      token: 'ETH',
    })

    // Poll for confirmation
    rpcClient.pollTransaction(txHash, async (receipt) => {
      const status = receipt.status === '0x1' ? 'confirmed' : 'failed'
      await ExtensionStorage.updateTransactionStatus(txHash, status)
    })

    sendResponse({ success: true, txHash })
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handlePrivateTransfer(data: any, sendResponse: (response: any) => void) {
  try {
    if (!inMemoryWallet) {
      sendResponse({ success: false, error: 'Wallet is locked' })
      return
    }

    // Get RAILGUN wallet info from storage
    const encryptedWallet = await chrome.storage.local.get('encryptedWallet')
    const walletData = encryptedWallet.encryptedWallet

    if (!walletData || !walletData.railgunWalletID) {
      sendResponse({ success: false, error: 'RAILGUN wallet not found. Please create a RAILGUN wallet first.' })
      return
    }

    // Execute private transfer via API
    const result = await railgunAPI.privateTransfer({
      senderWalletID: walletData.railgunWalletID,
      senderEncryptionKey: walletData.railgunEncryptionKey || '',
      senderRailgunAddress: walletData.railgunAddress || '',
      recipientPublicAddress: data.recipientPublicAddress,
      tokenAddress: data.tokenAddress,
      amount: data.amount,
      mnemonic: inMemoryWallet.mnemonic,
      password: data.password,
    })

    if (result.success) {
      sendResponse({
        success: true,
        shieldTxHash: result.shieldTxHash,
        unshieldTxHash: result.unshieldTxHash,
      })
    } else {
      sendResponse({ success: false, error: result.error })
    }
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handleGetBalance(data: { address: string; token?: string }, sendResponse: (response: any) => void) {
  try {
    const settings = await ExtensionStorage.getSettings()
    const network = settings.selectedNetwork || 'sepolia'

    const rpcClient = getRPCClient(network)

    if (data.token && data.token !== 'ETH') {
      // Get ERC20 token balance
      const balance = await rpcClient.getTokenBalance(data.token, data.address)
      sendResponse({ success: true, balance })
    } else {
      // Get native balance
      const balance = await rpcClient.getBalance(data.address)
      sendResponse({ success: true, balance })
    }
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handleSwitchNetwork(network: string, sendResponse: (response: any) => void) {
  try {
    const settings = await ExtensionStorage.getSettings()
    settings.selectedNetwork = network

    await ExtensionStorage.saveSettings(settings)

    // Notify content scripts of chain change
    const networkInfo = walletCore.getNetworkInfo(NETWORKS[network as keyof typeof NETWORKS]?.chainId || '')

    chrome.runtime.sendMessage({
      type: 'CHAIN_CHANGED',
      chainId: networkInfo.chainId,
    })

    sendResponse({ success: true, network })
  } catch (error: any) {
    sendResponse({ success: false, error: error.message })
  }
}

async function handleRPCRequest(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  const { request, origin } = message

  // Import RPCHandler
  const { RPCHandler } = await import('./rpc-handler')
  const handler = new RPCHandler()

  const response = await handler.handleRequest(request, origin)
  sendResponse(response)
}

// Export for use in other files
export { STORAGE_KEYS, lockWallet, resetAutoLockTimer, inMemoryWallet }
