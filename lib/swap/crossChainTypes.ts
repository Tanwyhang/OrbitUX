/**
 * Cross-Chain Pool Types
 * Types for cross-chain swap, transfer, and pool operations
 */

import type { PoolToken, Pool, PoolPair } from './types';

// ═══════════════════════════════════════════════════════════════
// CHAIN TYPES
// ═══════════════════════════════════════════════════════════════

/** Chain ID type for type safety */
export type ChainId = number;

/** Supported chain identifiers */
export type SupportedChainId = 11155111 | 421614 | 80002;

// ═══════════════════════════════════════════════════════════════
// POOL TYPES
// ═══════════════════════════════════════════════════════════════

/** Extended pool configuration with cross-chain capabilities */
export interface CrossChainPool extends Pool {
  /** Supported destination chains for cross-chain operations */
  supportedChains: ChainId[];
  /** Whether cross-chain operations are enabled */
  isCrossChainEnabled: boolean;
}

/** Pool reserves with chain info */
export interface CrossChainPoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  chainId: ChainId;
}

// ═══════════════════════════════════════════════════════════════
// OPERATION TYPES
// ═══════════════════════════════════════════════════════════════

/** Type of cross-chain operation */
export type CrossChainOperationType = 
  | 'swap'              // Same-chain swap
  | 'transfer'          // Cross-chain transfer (no swap)
  | 'cross_chain_swap'; // Cross-chain swap (swap + transfer)

/** Cross-chain transfer parameters */
export interface CrossChainTransferParams {
  /** Destination chain ID */
  destChainId: ChainId;
  /** Recipient address on destination chain */
  recipient: `0x${string}`;
  /** Token to transfer (token0 or token1) */
  token: PoolToken;
  /** Amount to transfer */
  amount: bigint;
  /** Pool to use for the transfer */
  pool: CrossChainPool;
}

/** Cross-chain swap parameters */
export interface CrossChainSwapParams {
  /** Destination chain ID */
  destChainId: ChainId;
  /** Input token */
  tokenIn: PoolToken;
  /** Output token (received on destination chain) */
  tokenOut: PoolToken;
  /** Amount of input token */
  amountIn: bigint;
  /** Minimum output amount (slippage protection) */
  minAmountOut: bigint;
  /** Recipient address on destination chain */
  recipient: `0x${string}`;
  /** Pool to use */
  pool: CrossChainPool;
}

/** Same-chain swap parameters */
export interface SwapParams {
  /** Input token */
  tokenIn: PoolToken;
  /** Output token */
  tokenOut: PoolToken;
  /** Amount of input token */
  amountIn: bigint;
  /** Minimum output amount (slippage protection) */
  minAmountOut: bigint;
  /** Recipient address */
  recipient: `0x${string}`;
  /** Pool to use */
  pool: CrossChainPool;
}

// ═══════════════════════════════════════════════════════════════
// QUOTE TYPES
// ═══════════════════════════════════════════════════════════════

/** Quote for a same-chain swap */
export interface CrossChainSwapQuote {
  /** Operation type */
  type: 'swap';
  /** Input token */
  tokenIn: PoolToken;
  /** Output token */
  tokenOut: PoolToken;
  /** Input amount */
  amountIn: bigint;
  /** Expected output amount */
  amountOut: bigint;
  /** Minimum output after slippage */
  minAmountOut: bigint;
  /** Price impact percentage */
  priceImpact: number;
  /** Fee amount */
  feeAmount: bigint;
  /** Fee in basis points */
  feeBps: number;
  /** Pool used */
  pool: CrossChainPool;
}

/** Quote for a cross-chain transfer */
export interface CrossChainTransferQuote {
  /** Operation type */
  type: 'transfer';
  /** Token being transferred */
  token: PoolToken;
  /** Source chain */
  sourceChainId: ChainId;
  /** Destination chain */
  destChainId: ChainId;
  /** Input amount */
  amountIn: bigint;
  /** Amount received after fee */
  amountOut: bigint;
  /** Fee amount */
  feeAmount: bigint;
  /** Fee in basis points */
  feeBps: number;
  /** Pool used */
  pool: CrossChainPool;
}

/** Quote for a cross-chain swap */
export interface CrossChainCrossSwapQuote {
  /** Operation type */
  type: 'cross_chain_swap';
  /** Input token (on source chain) */
  tokenIn: PoolToken;
  /** Output token (on destination chain) */
  tokenOut: PoolToken;
  /** Source chain */
  sourceChainId: ChainId;
  /** Destination chain */
  destChainId: ChainId;
  /** Input amount */
  amountIn: bigint;
  /** Expected output amount on destination */
  amountOut: bigint;
  /** Minimum output after slippage */
  minAmountOut: bigint;
  /** Price impact percentage */
  priceImpact: number;
  /** Total fee amount */
  feeAmount: bigint;
  /** Total fee in basis points */
  feeBps: number;
  /** Pool used */
  pool: CrossChainPool;
}

/** Union of all quote types */
export type CrossChainQuote = 
  | CrossChainSwapQuote 
  | CrossChainTransferQuote 
  | CrossChainCrossSwapQuote;

// ═══════════════════════════════════════════════════════════════
// EXECUTION TYPES
// ═══════════════════════════════════════════════════════════════

/** Cross-chain operation step */
export type CrossChainStep =
  | 'idle'
  | 'checking_allowance'
  | 'approving'
  | 'executing_swap'
  | 'executing_transfer'
  | 'executing_cross_chain_swap'
  | 'waiting_confirmation'
  | 'waiting_relay'      // Waiting for cross-chain relay
  | 'complete'
  | 'error';

/** Cross-chain operation progress */
export interface CrossChainProgress {
  /** Current step */
  step: CrossChainStep;
  /** Human-readable message */
  message: string;
  /** Source chain transaction hash */
  sourceTxHash?: `0x${string}`;
  /** Destination chain transaction hash (for cross-chain ops) */
  destTxHash?: `0x${string}`;
  /** Error if any */
  error?: Error;
  /** Estimated time remaining (seconds) */
  estimatedTimeRemaining?: number;
}

/** Cross-chain operation result */
export interface CrossChainResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Source chain transaction hash */
  sourceTxHash?: `0x${string}`;
  /** Destination chain transaction hash */
  destTxHash?: `0x${string}`;
  /** Actual output amount */
  outputAmount?: bigint;
  /** Error if failed */
  error?: Error;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════

/** Fee configuration */
export interface CrossChainFeeConfig {
  /** Standard swap fee in basis points */
  SWAP_FEE_BPS: number;
  /** Cross-chain transfer fee in basis points */
  CROSS_CHAIN_TRANSFER_FEE_BPS: number;
  /** Cross-chain swap fee in basis points */
  CROSS_CHAIN_SWAP_FEE_BPS: number;
}

/** Full cross-chain configuration */
export interface CrossChainConfig {
  /** Source chain ID (Sepolia) */
  sourceChainId: ChainId;
  /** RPC URL for source chain */
  rpcUrl: string;
  /** Token configurations */
  tokens: Record<string, PoolToken>;
  /** Pool configurations */
  pools: Record<PoolPair, CrossChainPool>;
  /** Supported destination chains */
  supportedDestinationChains: ChainId[];
  /** Fee configuration */
  fees: CrossChainFeeConfig;
}

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════

/** Event emitted on swap execution */
export interface SwapExecutedEvent {
  user: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  transactionHash: `0x${string}`;
}

/** Event emitted on cross-chain transfer initiation */
export interface TransferInitiatedEvent {
  from: `0x${string}`;
  to: `0x${string}`;
  destChainId: ChainId;
  amount: bigint;
  transactionHash: `0x${string}`;
}

/** Event emitted on cross-chain swap initiation */
export interface CrossChainSwapInitiatedEvent {
  from: `0x${string}`;
  to: `0x${string}`;
  destChainId: ChainId;
  amountIn: bigint;
  estimatedOut: bigint;
  transactionHash: `0x${string}`;
}
