// RPC Client for interacting with Ethereum networks
// Handles transaction broadcasting and balance queries

import { walletCore, NETWORKS } from './wallet-core'

export interface TransactionParams {
  from: string
  to: string
  value?: string
  data?: string
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  nonce?: string
}

export interface TransactionReceipt {
  blockHash: string
  blockNumber: string
  transactionHash: string
  from: string
  to: string
  status: string
  gasUsed: string
}

class RPCClient {
  private rpcUrl: string

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl
  }

  /**
   * Make a JSON-RPC call
   */
  private async call(method: string, params: any[] = []): Promise<any> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message || 'RPC error')
    }

    return data.result
  }

  /**
   * Get account balance
   */
  async getBalance(address: string): Promise<string> {
    return this.call('eth_getBalance', [address, 'latest'])
  }

  /**
   * Get transaction count (nonce)
   */
  async getTransactionCount(address: string): Promise<number> {
    const nonce = await this.call('eth_getTransactionCount', [address, 'latest'])
    return parseInt(nonce, 16)
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(txParams: TransactionParams): Promise<string> {
    return this.call('eth_estimateGas', [
      {
        from: txParams.from,
        to: txParams.to,
        value: txParams.value || '0x0',
        data: txParams.data || '0x',
      },
    ])
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<string> {
    return this.call('eth_gasPrice', [])
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    const blockNumber = await this.call('eth_blockNumber', [])
    return parseInt(blockNumber, 16)
  }

  /**
   * Send raw transaction
   */
  async sendRawTransaction(signedTx: string): Promise<string> {
    return this.call('eth_sendRawTransaction', [signedTx])
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    return this.call('eth_getTransactionReceipt', [txHash])
  }

  /**
   * Get ERC20 token balance
   */
  async getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<string> {
    // ERC20 balanceOf signature: 0x70a08231
    const data = '0x70a08231' + this.padAddress(ownerAddress)

    const balance = await this.call('eth_call', [
      {
        to: tokenAddress,
        data,
      },
      'latest',
    ])

    return balance
  }

  /**
   * Helper: Pad address to 32 bytes for ABI encoding
   */
  private padAddress(address: string): string {
    return address.slice(2).padStart(64, '0')
  }

  /**
   * Wait for transaction receipt
   */
  async waitForTransactionReceipt(
    txHash: string,
    timeout = 60000
  ): Promise<TransactionReceipt> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const receipt = await this.getTransactionReceipt(txHash)
      if (receipt) {
        return receipt
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Transaction receipt timeout')
  }

  /**
   * Poll for transaction confirmation
   */
  async pollTransaction(
    txHash: string,
    callback: (receipt: TransactionReceipt) => void
  ): Promise<void> {
    try {
      const receipt = await this.waitForTransactionReceipt(txHash)
      callback(receipt)
    } catch (error) {
      console.error('Error polling transaction:', error)
    }
  }
}

// Get RPC client instance for selected network
export function getRPCClient(network: string): RPCClient {
  const rpcUrl = walletCore.getRpcUrl(network)
  return new RPCClient(rpcUrl)
}

// Export transaction builder
export class TransactionBuilder {
  /**
   * Build a complete transaction object
   */
  static async buildTransaction(
    txParams: TransactionParams,
    network: string
  ): Promise<TransactionParams> {
    const rpcClient = getRPCClient(network)

    // Get nonce
    const nonce = await rpcClient.getTransactionCount(txParams.from)

    // Estimate gas
    const gasLimit = await rpcClient.estimateGas(txParams)

    // Get gas price (or use EIP-1559 base fee)
    const gasPrice = await rpcClient.getGasPrice()

    return {
      ...txParams,
      nonce: `0x${nonce.toString(16)}`,
      gasLimit,
      gasPrice,
      chainId: NETWORKS[network as keyof typeof NETWORKS]?.chainId || '0xaa36a7',
    }
  }

  /**
   * Build an ERC20 transfer transaction
   */
  static async buildTokenTransfer(
    from: string,
    tokenAddress: string,
    to: string,
    amount: string,
    network: string
  ): Promise<TransactionParams> {
    // ERC20 transfer signature: 0xa9059cbb
    // encodeParameters(['address', 'uint256'], [to, amount])
    const amountHex = '0x' + BigInt(amount).toString(16).padStart(64, '0')
    const data = '0xa9059cbb' + this.padAddress(to) + amountHex

    const txParams = {
      from,
      to: tokenAddress,
      data,
      value: '0x0',
    }

    return this.buildTransaction(txParams, network)
  }

  private static padAddress(address: string): string {
    return address.slice(2).padStart(64, '0')
  }
}
