import type { PoolToken, Pool, PoolPair, TokenSymbol } from './types';

// RPC Configuration
export const SWAP_RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/lO9FWaEPl-y8mMJHInELW';

// Token addresses on Sepolia
export const TOKEN_ADDRESSES: Record<TokenSymbol, `0x${string}`> = {
  ETH: '0x715f70ef11A65b4c8A7CCAa32E8aAaeE5011F15e',
  USDT: '0xa3750d39Fa8c377a7FB87FD1F2Be4321722E2c58',
  EURC: '0x326c5d56646A513151c75DFa5923eF6875dE53d5',
} as const;

// Pool addresses on Sepolia
export const POOL_ADDRESSES: Record<PoolPair, `0x${string}`> = {
  ETH_USDT: '0xD8abab3a58b8c5F9d888dE55ab5EaCAB7C875340',
  EURC_USDT: '0x7f8Ac573Eb95b79e422a77FD01386afbB8e265bc',
  ETH_EURC: '0xfF0dd27e9Fa0c0DC5c02ed52822Cf7cD5F779892',
} as const;

// Token configurations
export const TOKENS: Record<TokenSymbol, PoolToken> = {
  ETH: {
    symbol: 'ETH',
    address: TOKEN_ADDRESSES.ETH,
    decimals: 18,
    name: 'Ethereum',
    color: 'bg-blue-500',
  },
  USDT: {
    symbol: 'USDT',
    address: TOKEN_ADDRESSES.USDT,
    decimals: 18, // Sepolia test token uses 18 decimals
    name: 'Tether USD',
    color: 'bg-green-500',
  },
  EURC: {
    symbol: 'EURC',
    address: TOKEN_ADDRESSES.EURC,
    decimals: 18, // Sepolia test token uses 18 decimals
    name: 'Euro Coin',
    color: 'bg-blue-400',
  },
} as const;

// Pool configurations
export const POOLS: Record<PoolPair, Pool> = {
  ETH_USDT: {
    address: POOL_ADDRESSES.ETH_USDT,
    pair: 'ETH_USDT',
    token0: TOKENS.ETH,
    token1: TOKENS.USDT,
  },
  EURC_USDT: {
    address: POOL_ADDRESSES.EURC_USDT,
    pair: 'EURC_USDT',
    token0: TOKENS.EURC,
    token1: TOKENS.USDT,
  },
  ETH_EURC: {
    address: POOL_ADDRESSES.ETH_EURC,
    pair: 'ETH_EURC',
    token0: TOKENS.ETH,
    token1: TOKENS.EURC,
  },
} as const;

// List of all tokens for UI dropdown
export const TOKEN_LIST: PoolToken[] = [TOKENS.ETH, TOKENS.USDT, TOKENS.EURC];

// ERC20 ABI (minimal for swap operations)
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

// Pool ABI
export const POOL_ABI = [
  {
    name: 'swap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount0In', type: 'uint256' },
      { name: 'amount1In', type: 'uint256' },
      { name: 'amount0OutMinimum', type: 'uint256' },
      { name: 'amount1OutMinimum', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [
      { name: 'amount0Out', type: 'uint256' },
      { name: 'amount1Out', type: 'uint256' },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'reserve0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'reserve1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Default slippage tolerance (0.5%)
export const DEFAULT_SLIPPAGE = 0.5;

// Slippage presets
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;

// High slippage warning threshold
export const HIGH_SLIPPAGE_THRESHOLD = 2.0;

// Quote refresh interval (ms)
export const QUOTE_REFRESH_INTERVAL = 15000;

// Quote debounce delay (ms)
export const QUOTE_DEBOUNCE_DELAY = 300;
