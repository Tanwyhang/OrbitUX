/**
 * Uniswap v3 Swap Types
 */

import type { SupportedChainId, TokenConfig } from '@/lib/swap/unifiedConfig';

// ============================================================================
// Trade Types
// ============================================================================

export type UniswapTradeType = 'EXACT_INPUT' | 'EXACT_OUTPUT';

// ============================================================================
// Quote Types
// ============================================================================

export interface UniswapQuote {
  // Input/output amounts
  inputAmount: bigint;
  outputAmount: bigint;
  inputToken: TokenConfig;
  outputToken: TokenConfig;

  // Trade details
  tradeType: UniswapTradeType;

  // Price and impact
  executionPrice: number;        // Output per input token
  priceImpact: number;           // Percentage (0-100)

  // Minimum received (after slippage)
  minimumReceived: bigint;
  slippage: number;              // Slippage tolerance used (0-100)

  // Route information
  route: {
    tokenPath: TokenConfig[];    // Tokens in the swap path
    poolFees: number[];          // Fee tiers for each pool (500, 3000, 10000)
  };

  // Gas estimates
  estimatedGasUsed: bigint;
  estimatedGasCostUSD?: number;

  // Timestamp
  timestamp: number;
}

// ============================================================================
// Swap Params
// ============================================================================

export interface UniswapSwapParams {
  quote: UniswapQuote;
  recipient?: `0x${string}`;     // Defaults to user's address
  deadline?: number;             // Unix timestamp, defaults to 20 mins
}

// ============================================================================
// Swap Result
// ============================================================================

export interface UniswapSwapResult {
  success: boolean;
  txHash?: `0x${string}`;
  outputAmount?: bigint;
  error?: string;
}

// ============================================================================
// Quote Options
// ============================================================================

export interface QuoteOptions {
  slippage: number;              // Slippage tolerance (0-100)
  deadline?: number;             // Transaction deadline in seconds from now
  feeTiers?: number[];           // Fee tiers to consider (500, 3000, 10000)
  maxHops?: number;              // Maximum number of hops (default: 3)
}

// ============================================================================
// Pool State
// ============================================================================

export interface PoolState {
  token0: TokenConfig;
  token1: TokenConfig;
  fee: number;                   // Fee tier (500, 3000, 10000)
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
}

// ============================================================================
// Cross-Chain Quote (Uniswap X)
// ============================================================================

export interface CrossChainQuote {
  // Chain info
  fromChainId: SupportedChainId;
  toChainId: SupportedChainId;

  // Amounts
  inputAmount: bigint;
  outputAmount: bigint;
  inputToken: TokenConfig;
  outputToken: TokenConfig;

  // Fees
  bridgeFee: bigint;
  relayFee: bigint;
  totalFee: bigint;

  // Timing
  estimatedDuration: number;     // Seconds

  // Price info
  executionPrice: number;
  priceImpact: number;
  minimumReceived: bigint;
  slippage: number;

  // Route
  route: {
    // Same-chain swap on source (optional)
    sourceSwap?: {
      inputToken: TokenConfig;
      outputToken: TokenConfig;
      outputAmount: bigint;
    };

    // Bridge token
    bridgeToken: TokenConfig;

    // Same-chain swap on destination (optional)
    destinationSwap?: {
      inputToken: TokenConfig;
      outputToken: TokenConfig;
      outputAmount: bigint;
    };
  };

  timestamp: number;
}

export interface CrossChainSwapParams {
  quote: CrossChainQuote;
  recipient?: `0x${string}`;
  deadline?: number;
}

export interface CrossChainSwapResult {
  success: boolean;
  txHash?: `0x${string}`;
  bridgeTxHash?: `0x${string}`;
  outputAmount?: bigint;
  error?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class UniswapError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'UniswapError';
  }
}

export const ERROR_CODES = {
  NO_ROUTE: 'NO_ROUTE',
  INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  ALLOWANCE_FAILED: 'ALLOWANCE_FAILED',
} as const;
