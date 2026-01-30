// Inpage Script - Defines window.ethereum provider
// This script runs in the page's JavaScript context (isolated from extension)

// Provider interface following EIP-1193
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
  isOrbit: boolean
  chainId: string
  selectedAddress: string | null
  networkVersion: string
  enable?: () => Promise<string[]>
  send?: (method: string, params?: unknown[]) => Promise<unknown>
}

// Event listeners map
const listeners = new Map<string, Set<Function>>()

// Current provider state
let chainId = '0xaa36a7' // Sepolia
let selectedAddress: string | null = null

// Send message to content script
function sendMessageToContent(message: any): Promise<any> {
  // Use window.postMessage to communicate with content script
  const responseId = Math.random().toString(36).substring(7)

  return new Promise((resolve, reject) => {
    const messageHandler = (event: MessageEvent) => {
      if (event.source !== window || event.data.type !== 'ORBIT_RESPONSE') return
      if (event.data.responseId === responseId) {
        window.removeEventListener('message', messageHandler)
        if (event.data.error) {
          reject(new Error(event.data.error))
        } else {
          resolve(event.data.result)
        }
      }
    }

    window.addEventListener('message', messageHandler)

    // Send request to content script
    window.postMessage({
      type: 'ORBIT_REQUEST',
      requestId: responseId,
      ...message,
    }, '*')

    // Timeout after 30 seconds
    setTimeout(() => {
      window.removeEventListener('message', messageHandler)
      reject(new Error('Request timeout'))
    }, 30000)
  })
}

// Listen for messages from content script (state updates)
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.type !== 'ORBIT_EVENT') return

  const { eventType, data } = event.data

  // Emit event to listeners
  const eventListeners = listeners.get(eventType)
  if (eventListeners) {
    eventListeners.forEach((listener) => {
      try {
        listener(data)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    })
  }

  // Update internal state
  if (eventType === 'accountsChanged') {
    selectedAddress = data[0] || null
  } else if (eventType === 'chainChanged') {
    chainId = data
  }
})

// Main provider object
const orbitProvider: EthereumProvider = {
  isOrbit: true,
  chainId,
  selectedAddress,
  networkVersion: '11155111', // Sepolia

  // Main request method (EIP-1193)
  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    console.log('Orbit provider request:', args.method)

    // Get origin from current page
    const origin = window.location.origin

    try {
      const result = await sendMessageToContent({
        method: args.method,
        params: args.params || [],
        origin,
      })

      // Update state based on response
      if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') {
        const accounts = result as string[]
        selectedAddress = accounts[0] || null
        if (accounts.length > 0) {
          this.selectedAddress = selectedAddress
        }
      } else if (args.method === 'eth_chainId') {
        chainId = result as string
        this.chainId = chainId
      }

      return result
    } catch (error: any) {
      // Handle user rejected errors
      if (error.message.includes('User rejected')) {
        const userRejectedError = new Error(error.message)
        ;(userRejectedError as any).code = 4001
        throw userRejectedError
      }
      throw error
    }
  },

  // Event emitter methods
  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(listener)
  },

  removeListener(event: string, listener: (...args: unknown[]) => void): void {
    const eventListeners = listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(listener)
      if (eventListeners.size === 0) {
        listeners.delete(event)
      }
    }
  },
}

// Legacy support methods
orbitProvider.enable = async function (): Promise<string[]> {
  return (await this.request({ method: 'eth_requestAccounts' })) as string[]
}

orbitProvider.send = async function (
  method: string,
  params?: unknown[]
): Promise<unknown> {
  if (typeof method === 'string') {
    return await this.request({ method, params })
  } else {
    // Legacy send({ method, params }) syntax
    return await this.request(method as any)
  }
}

// Inject provider into window
if (typeof window !== 'undefined' && !window.ethereum) {
  window.ethereum = orbitProvider as any
  console.log('Orbit Wallet provider injected')

  // Dispatch event for dApps to detect
  window.dispatchEvent(new Event('ethereum#initialized'))
}

// Prevent multiple injections
;(window as any).orbitWalletInjected = true

export default orbitProvider
