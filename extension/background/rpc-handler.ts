// RPC Handler for EIP-1193 Provider Requests
// Handles Web3 JSON-RPC methods from dApps

// Interfaces
interface JsonRpcRequest {
  id: number | string
  jsonrpc: '2.0'
  method: string
  params?: unknown[]
}

interface JsonRpcResponse {
  id: number | string
  jsonrpc: '2.0'
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface TransactionParams {
  from?: string
  to: string
  value?: string
  data?: string
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
}

// Error codes (EIP-1193)
const ERROR_CODES = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
}

// Network configurations
const NETWORKS: Record<string, { chainId: string; name: string }> = {
  ethereum: { chainId: '0x1', name: 'Ethereum Mainnet' },
  sepolia: { chainId: '0xaa36a7', name: 'Sepolia Testnet' },
  polygon: { chainId: '0x89', name: 'Polygon Mainnet' },
}

class RPCHandler {
  private pendingApprovals = new Map<string, any>()

  async handleRequest(request: JsonRpcRequest, origin: string): Promise<JsonRpcResponse> {
    const { method, params = [] } = request

    console.log('RPC request:', method, 'from', origin)

    try {
      switch (method) {
        // Wallet connection
        case 'eth_requestAccounts':
          return await this.handleRequestAccounts(origin, request)

        case 'eth_accounts':
          return await this.getAccounts(request)

        // Account info
        case 'eth_getBalance':
          return await this.getBalance(request, params)

        case 'eth_getBlockNumber':
          return await this.getBlockNumber(request)

        // Transaction signing
        case 'eth_sendTransaction':
          return await this.sendTransaction(params[0] as TransactionParams, origin, request)

        case 'eth_signTransaction':
          return await this.signTransaction(params[0] as TransactionParams, request)

        case 'personal_sign':
          return await this.personalSign(params, origin, request)

        case 'eth_signTypedData_v4':
          return await this.signTypedData(params, origin, request)

        // Network
        case 'eth_chainId':
          return this.getChainId(request)

        case 'wallet_switchEthereumChain':
          return await this.switchChain(params[0] as { chainId: string }, origin, request)

        case 'wallet_addEthereumChain':
          return await this.addChain(params[0] as any, request)

        // RAILGUN-specific methods (Orbit extension)
        case 'orbit_privateTransfer':
          return await this.privateTransfer(params[0] as any, origin, request)

        case 'orbit_getPrivateBalance':
          return await this.getPrivateBalance(params[0] as string, request)

        case 'orbit_shieldTokens':
          return await this.shieldTokens(params[0] as any, origin, request)

        case 'orbit_unshieldTokens':
          return await this.unshieldTokens(params[0] as any, origin, request)

        default:
          return this.errorResponse(
            request,
            ERROR_CODES.UNSUPPORTED_METHOD,
            `Method ${method} not supported`
          )
      }
    } catch (error: any) {
      console.error('RPC error:', error)
      return this.errorResponse(request, error.code || -32603, error.message || 'Internal error')
    }
  }

  // Handle eth_requestAccounts - Prompt user to connect
  private async handleRequestAccounts(
    origin: string,
    request: JsonRpcRequest
  ): Promise<JsonRpcResponse> {
    // Check if already connected
    const connected = await this.isOriginConnected(origin)
    if (connected) {
      return await this.getAccounts(request)
    }

    // Show approval popup
    const approved = await this.showApprovalPopup({
      type: 'connect',
      origin,
    })

    if (!approved) {
      return this.errorResponse(request, ERROR_CODES.USER_REJECTED, 'User rejected the request')
    }

    // Save origin permission
    await this.saveOriginPermission(origin)

    return await this.getAccounts(request)
  }

  // Get connected accounts
  private async getAccounts(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const lockState = await chrome.storage.local.get('lockState')
    const locked = lockState.lockState?.locked !== false

    if (locked) {
      return this.errorResponse(request, ERROR_CODES.UNAUTHORIZED, 'Wallet is locked')
    }

    const accountsStorage = await chrome.storage.local.get('accounts')
    const accounts = accountsStorage.accounts || []

    const addresses = accounts.map((acc: any) => acc.address)

    return {
      id: request.id,
      jsonrpc: '2.0',
      result: addresses,
    }
  }

  // Get current chain ID
  private getChainId(request: JsonRpcRequest): JsonRpcResponse {
    // Get from settings
    chrome.storage.local.get('settings').then((storage) => {
      const settings = storage.settings || {}
      const network = settings.selectedNetwork || 'sepolia'
      return NETWORKS[network]?.chainId || '0xaa36a7'
    })

    // For now, return Sepolia
    return {
      id: request.id,
      jsonrpc: '2.0',
      result: '0xaa36a7',
    }
  }

  // Get account balance
  private async getBalance(request: JsonRpcRequest, params: unknown[]): Promise<JsonRpcResponse> {
    const address = params[0] as string
    const block = params[1] || 'latest'

    // TODO: Implement actual balance fetching via RPC
    // For now, return a mock balance
    return {
      id: request.id,
      jsonrpc: '2.0',
      result: '0x0', // 0 wei
    }
  }

  // Get current block number
  private async getBlockNumber(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // TODO: Implement actual block number fetching
    return {
      id: request.id,
      jsonrpc: '2.0',
      result: '0x0',
    }
  }

  // Send transaction
  private async sendTransaction(
    txParams: TransactionParams,
    origin: string,
    request: JsonRpcRequest
  ): Promise<JsonRpcResponse> {
    // Validate transaction
    if (!txParams.to) {
      return this.errorResponse(request, -32602, 'Missing transaction parameter: to')
    }

    // Show approval popup with transaction details
    const approved = await this.showApprovalPopup({
      type: 'transaction',
      origin,
      transaction: txParams,
    })

    if (!approved) {
      return this.errorResponse(request, ERROR_CODES.USER_REJECTED, 'User rejected the transaction')
    }

    // TODO: Execute transaction
    // For now, return a mock transaction hash
    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

    return {
      id: request.id,
      jsonrpc: '2.0',
      result: txHash,
    }
  }

  // Sign transaction
  private async signTransaction(txParams: TransactionParams, request: JsonRpcRequest) {
    // TODO: Implement transaction signing
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Personal sign
  private async personalSign(params: unknown[], origin: string, request: JsonRpcResponse) {
    const message = params[0] as string
    const address = params[1] as string

    // Show approval popup
    const approved = await this.showApprovalPopup({
      type: 'sign',
      origin,
      message,
    })

    if (!approved) {
      return this.errorResponse(request, ERROR_CODES.USER_REJECTED, 'User rejected the signature request')
    }

    // TODO: Sign the message
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Sign typed data (EIP-712)
  private async signTypedData(params: unknown[], origin: string, request: JsonRpcResponse) {
    // TODO: Implement typed data signing
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Switch chain
  private async switchChain(
    chainParams: { chainId: string },
    origin: string,
    request: JsonRpcResponse
  ) {
    // Find network by chain ID
    const networkName = Object.entries(NETWORKS).find(
      ([, config]) => config.chainId.toLowerCase() === chainParams.chainId.toLowerCase()
    )?.[0]

    if (!networkName) {
      return this.errorResponse(request, 4902, 'Chain not configured in this wallet')
    }

    // Show approval popup
    const approved = await this.showApprovalPopup({
      type: 'switchNetwork',
      origin,
      network: NETWORKS[networkName].name,
    })

    if (!approved) {
      return this.errorResponse(request, ERROR_CODES.USER_REJECTED, 'User rejected the network switch')
    }

    // Update selected network
    const settings = await chrome.storage.local.get('settings')
    const currentSettings = settings.settings || {}
    currentSettings.selectedNetwork = networkName

    await chrome.storage.local.set({ settings: currentSettings })

    // Notify content scripts of chain change
    this.emitChainChanged(chainParams.chainId)

    return {
      id: request.id,
      jsonrpc: '2.0',
      result: null,
    }
  }

  // Add chain
  private async addChain(chainParams: any, request: JsonRpcResponse) {
    // TODO: Implement adding custom networks
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Private transfer (RAILGUN)
  private async privateTransfer(params: any, origin: string, request: JsonRpcResponse) {
    // Show approval popup with detailed breakdown
    const approved = await this.showApprovalPopup({
      type: 'privateTransfer',
      origin,
      transfer: params,
    })

    if (!approved) {
      return this.errorResponse(request, ERROR_CODES.USER_REJECTED, 'User rejected the private transfer')
    }

    // TODO: Call RAILGUN API
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Get private balance
  private async getPrivateBalance(address: string, request: JsonRpcResponse) {
    // TODO: Fetch private balance from RAILGUN API
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Shield tokens
  private async shieldTokens(params: any, origin: string, request: JsonRpcResponse) {
    // TODO: Implement shielding via RAILGUN API
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Unshield tokens
  private async unshieldTokens(params: any, origin: string, request: JsonRpcResponse) {
    // TODO: Implement unshielding via RAILGUN API
    return this.errorResponse(request, ERROR_CODES.UNSUPPORTED_METHOD, 'Not implemented yet')
  }

  // Helper: Check if origin is already connected
  private async isOriginConnected(origin: string): Promise<boolean> {
    const permissions = await chrome.storage.local.get('permissions')
    const connectedOrigins = permissions.permissions?.connectedOrigins || []
    return connectedOrigins.includes(origin)
  }

  // Helper: Save origin permission
  private async saveOriginPermission(origin: string): Promise<void> {
    const permissions = await chrome.storage.local.get('permissions')
    const currentPermissions = permissions.permissions || { connectedOrigins: [] }

    if (!currentPermissions.connectedOrigins.includes(origin)) {
      currentPermissions.connectedOrigins.push(origin)
      await chrome.storage.local.set({ permissions: currentPermissions })
    }
  }

  // Helper: Show approval popup
  private async showApprovalPopup(approvalData: {
    type: string
    origin: string
    [key: string]: any
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const approvalId = Date.now().toString()

      // Store approval request
      this.pendingApprovals.set(approvalId, approvalData)

      // Send message to popup
      chrome.runtime.sendMessage({
        type: 'APPROVAL_REQUEST',
        id: approvalId,
        data: approvalData,
      })

      // Listen for response
      const listener = (message: any) => {
        if (message.type === 'APPROVAL_RESPONSE' && message.id === approvalId) {
          chrome.runtime.onMessage.removeListener(listener)
          this.pendingApprovals.delete(approvalId)
          resolve(message.approved)
        }
      }

      chrome.runtime.onMessage.addListener(listener)

      // Timeout after 5 minutes
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener)
        this.pendingApprovals.delete(approvalId)
        resolve(false)
      }, 5 * 60 * 1000)
    })
  }

  // Helper: Emit chain changed event
  private emitChainChanged(chainId: string): void {
    chrome.runtime.sendMessage({
      type: 'CHAIN_CHANGED',
      chainId,
    })
  }

  // Helper: Create error response
  private errorResponse(request: JsonRpcRequest, code: number, message: string): JsonRpcResponse {
    return {
      id: request.id,
      jsonrpc: '2.0',
      error: {
        code,
        message,
      },
    }
  }
}

export { RPCHandler }
export type { JsonRpcRequest, JsonRpcResponse, TransactionParams }
