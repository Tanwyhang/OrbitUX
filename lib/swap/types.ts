import type { ComponentType, SVGProps } from 'react';

// Token symbols supported by the pools
export type TokenSymbol = 'ETH' | 'USDT' | 'EURC';

// Pool pair identifiers
export type PoolPair = 'ETH_USDT' | 'EURC_USDT' | 'ETH_EURC';

// Web3 icon component type
export type Web3IconComponent = ComponentType<SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono' }>;

// Token configuration
export interface PoolToken {
  symbol: TokenSymbol;
  address: `0x${string}`;
  decimals: number;
  name: string;
  color: string;
}

// Pool configuration
export interface Pool {
  address: `0x${string}`;
  pair: PoolPair;
  token0: PoolToken;
  token1: PoolToken;
}

// Pool reserves
export interface PoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
}

// Swap route
export interface SwapRoute {
  path: PoolToken[];       // Tokens in order [from, ..., to]
  pools: Pool[];           // Pools to use in order
  isMultiHop: boolean;     // True if routing through intermediary
}

// Quote result
export interface SwapQuote {
  route: SwapRoute;
  inputAmount: bigint;
  outputAmount: bigint;
  priceImpact: number;     // Percentage (0-100)
  minimumReceived: bigint; // After slippage
  slippage: number;        // Slippage tolerance used (0-100)
  executionPrice: number;  // Effective price per input token
}

// Swap execution state
export type SwapStep = 
  | 'idle'
  | 'approving'
  | 'shielding'            // RAILGUN: shield tokens
  | 'swapping'
  | 'unshielding'          // RAILGUN: unshield result
  | 'complete'
  | 'error';

// Swap progress information
export interface SwapProgress {
  step: SwapStep;
  message: string;
  txHash?: `0x${string}`;
  error?: Error;
}

// Slippage preset values
export type SlippagePreset = 0.1 | 0.5 | 1.0;

// Slippage settings
export interface SlippageSettings {
  value: number;           // Percentage (0-100)
  isCustom: boolean;
}

// Swap execution params
export interface SwapParams {
  quote: SwapQuote;
  privateMode: boolean;    // Use RAILGUN privacy
  recipient?: `0x${string}`; // Optional different recipient
}

// Swap result
export interface SwapResult {
  success: boolean;
  txHash?: `0x${string}`;
  outputAmount?: bigint;
  error?: Error;
}
