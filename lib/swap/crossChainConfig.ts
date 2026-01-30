/**
 * Cross-Chain Pool Configuration
 * Real Deployed Contracts on Sepolia Testnet
 * 
 * Network: Sepolia Testnet (Chain ID: 11155111)
 * Supported Destinations: Arbitrum Sepolia (421614), Polygon Amoy (80002)
 */

import type { PoolToken, Pool, PoolPair, TokenSymbol } from './types';
import type { ChainId, CrossChainPool, CrossChainConfig } from './crossChainTypes';

// ═══════════════════════════════════════════════════════════════
// CHAIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const CHAIN_IDS = {
  SEPOLIA: 11155111 as ChainId,
  ARBITRUM_SEPOLIA: 421614 as ChainId,
  POLYGON_AMOY: 80002 as ChainId,
} as const;

export const CHAIN_NAMES: Record<ChainId, string> = {
  [CHAIN_IDS.SEPOLIA]: 'Sepolia',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: 'Arbitrum Sepolia',
  [CHAIN_IDS.POLYGON_AMOY]: 'Polygon Amoy',
};

export const SUPPORTED_DESTINATION_CHAINS: ChainId[] = [
  CHAIN_IDS.ARBITRUM_SEPOLIA,
  CHAIN_IDS.POLYGON_AMOY,
];

// ═══════════════════════════════════════════════════════════════
// RPC CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/lO9FWaEPl-y8mMJHInELW';

// ═══════════════════════════════════════════════════════════════
// TOKEN ADDRESSES (SEPOLIA)
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_TOKEN_ADDRESSES: Record<TokenSymbol, `0x${string}`> = {
  ETH: '0x715f70ef11A65b4c8A7CCAa32E8aAaeE5011F15e',
  USDT: '0xa3750d39Fa8c377a7FB87FD1F2Be4321722E2c58',
  EURC: '0x326c5d56646A513151c75DFa5923eF6875dE53d5',
} as const;

// ═══════════════════════════════════════════════════════════════
// CROSS-CHAIN POOL ADDRESSES (SEPOLIA)
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_POOL_ADDRESSES: Record<PoolPair, `0x${string}`> = {
  ETH_USDT: '0x8A691ba5F5385916522917F9064044E994BD2b3e',
  EURC_USDT: '0xbe48c809Be034B1544dDA847774d6aF45602cB30',
  ETH_EURC: '0x04eBd4A555beF227E9F3AA4e85cebd58Db20e0b8',
} as const;

// ═══════════════════════════════════════════════════════════════
// TOKEN CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_TOKENS: Record<TokenSymbol, PoolToken> = {
  ETH: {
    symbol: 'ETH',
    address: CROSS_CHAIN_TOKEN_ADDRESSES.ETH,
    decimals: 18,
    name: 'Ethereum',
    color: 'bg-blue-500',
  },
  USDT: {
    symbol: 'USDT',
    address: CROSS_CHAIN_TOKEN_ADDRESSES.USDT,
    decimals: 18, // Sepolia test token uses 18 decimals
    name: 'Tether USD',
    color: 'bg-green-500',
  },
  EURC: {
    symbol: 'EURC',
    address: CROSS_CHAIN_TOKEN_ADDRESSES.EURC,
    decimals: 18, // Sepolia test token uses 18 decimals
    name: 'Euro Coin',
    color: 'bg-blue-400',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// CROSS-CHAIN POOL CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_POOLS: Record<PoolPair, CrossChainPool> = {
  ETH_USDT: {
    address: CROSS_CHAIN_POOL_ADDRESSES.ETH_USDT,
    pair: 'ETH_USDT',
    token0: CROSS_CHAIN_TOKENS.ETH,
    token1: CROSS_CHAIN_TOKENS.USDT,
    supportedChains: [CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.POLYGON_AMOY],
    isCrossChainEnabled: true,
  },
  EURC_USDT: {
    address: CROSS_CHAIN_POOL_ADDRESSES.EURC_USDT,
    pair: 'EURC_USDT',
    token0: CROSS_CHAIN_TOKENS.EURC,
    token1: CROSS_CHAIN_TOKENS.USDT,
    supportedChains: [CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.POLYGON_AMOY],
    isCrossChainEnabled: true,
  },
  ETH_EURC: {
    address: CROSS_CHAIN_POOL_ADDRESSES.ETH_EURC,
    pair: 'ETH_EURC',
    token0: CROSS_CHAIN_TOKENS.ETH,
    token1: CROSS_CHAIN_TOKENS.EURC,
    supportedChains: [CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.POLYGON_AMOY],
    isCrossChainEnabled: true,
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// FEE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_FEES = {
  /** Standard swap fee: 0.3% */
  SWAP_FEE_BPS: 30,
  /** Cross-chain transfer fee: 0.1% */
  CROSS_CHAIN_TRANSFER_FEE_BPS: 10,
  /** Cross-chain swap fee: 0.4% (0.1% + 0.3%) */
  CROSS_CHAIN_SWAP_FEE_BPS: 40,
} as const;

// ═══════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_POOL_ABI = [
  // ISimplePool functions
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
    name: 'getAmountOut',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'reserveIn', type: 'uint256' },
      { name: 'reserveOut', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
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
  // ICrossChainPool functions
  {
    name: 'crossChainTransfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'destChainId', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'crossChainSwap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'destChainId', type: 'uint256' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amount0OutMinimum', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'estimateCrossChainSwap',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'amountIn', type: 'uint256' }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'supportedChains',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'chainId', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'chainId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get pool by token pair
 */
export function getCrossChainPool(tokenA: TokenSymbol, tokenB: TokenSymbol): CrossChainPool | null {
  // Normalize order
  const pairKey = `${tokenA}_${tokenB}` as PoolPair;
  const reversePairKey = `${tokenB}_${tokenA}` as PoolPair;
  
  if (CROSS_CHAIN_POOLS[pairKey]) {
    return CROSS_CHAIN_POOLS[pairKey];
  }
  if (CROSS_CHAIN_POOLS[reversePairKey]) {
    return CROSS_CHAIN_POOLS[reversePairKey];
  }
  
  return null;
}

/**
 * Get pool by address
 */
export function getCrossChainPoolByAddress(address: `0x${string}`): CrossChainPool | null {
  const normalizedAddress = address.toLowerCase();
  
  for (const pool of Object.values(CROSS_CHAIN_POOLS)) {
    if (pool.address.toLowerCase() === normalizedAddress) {
      return pool;
    }
  }
  
  return null;
}

/**
 * Check if a chain is supported for cross-chain operations
 */
export function isChainSupported(chainId: ChainId): boolean {
  return SUPPORTED_DESTINATION_CHAINS.includes(chainId);
}

/**
 * Get chain name by ID
 */
export function getChainName(chainId: ChainId): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`;
}

/**
 * Calculate fee for a given operation
 */
export function calculateFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / BigInt(10000);
}

/**
 * Calculate amount after fee
 */
export function calculateAmountAfterFee(amount: bigint, feeBps: number): bigint {
  return amount - calculateFee(amount, feeBps);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FULL CONFIG
// ═══════════════════════════════════════════════════════════════

export const CROSS_CHAIN_CONFIG: CrossChainConfig = {
  sourceChainId: CHAIN_IDS.SEPOLIA,
  rpcUrl: CROSS_CHAIN_RPC_URL,
  tokens: CROSS_CHAIN_TOKENS,
  pools: CROSS_CHAIN_POOLS,
  supportedDestinationChains: SUPPORTED_DESTINATION_CHAINS,
  fees: CROSS_CHAIN_FEES,
};
