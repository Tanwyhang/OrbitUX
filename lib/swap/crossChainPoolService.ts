/**
 * Cross-Chain Pool Service
 * Handles swap, transfer, and cross-chain swap operations
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import type { PoolToken } from './types';
import type {
  ChainId,
  CrossChainPool,
  CrossChainPoolReserves,
  CrossChainSwapQuote,
  CrossChainTransferQuote,
  CrossChainCrossSwapQuote,
  CrossChainQuote,
} from './crossChainTypes';
import {
  CROSS_CHAIN_RPC_URL,
  CROSS_CHAIN_POOL_ABI,
  CROSS_CHAIN_FEES,
  CROSS_CHAIN_POOLS,
  CROSS_CHAIN_TOKENS,
  CHAIN_IDS,
  getCrossChainPool,
  calculateFee,
  calculateAmountAfterFee,
} from './crossChainConfig';
import { ERC20_ABI } from './config';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ZERO = BigInt(0);
const BPS_BASE = BigInt(10000);

// ═══════════════════════════════════════════════════════════════
// PUBLIC CLIENT
// ═══════════════════════════════════════════════════════════════

const publicClient: PublicClient = createPublicClient({
  chain: sepolia,
  transport: http(CROSS_CHAIN_RPC_URL),
});

// ═══════════════════════════════════════════════════════════════
// POOL QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get pool reserves
 */
export async function getCrossChainPoolReserves(
  pool: CrossChainPool
): Promise<CrossChainPoolReserves> {
  const [reserve0, reserve1, token0, token1] = await Promise.all([
    publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'reserve0',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'reserve1',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'token0',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'token1',
    }) as Promise<`0x${string}`>,
  ]);

  return {
    reserve0,
    reserve1,
    token0,
    token1,
    chainId: CHAIN_IDS.SEPOLIA,
  };
}

/**
 * Check if a chain is supported by a pool
 */
export async function isChainSupportedByPool(
  pool: CrossChainPool,
  chainId: ChainId
): Promise<boolean> {
  try {
    const supported = await publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'supportedChains',
      args: [BigInt(chainId)],
    });
    return supported as boolean;
  } catch {
    return false;
  }
}

/**
 * Get all pool reserves
 */
export async function getAllPoolReserves(): Promise<
  Record<string, CrossChainPoolReserves>
> {
  const pools = Object.values(CROSS_CHAIN_POOLS);
  const reservesPromises = pools.map((pool) =>
    getCrossChainPoolReserves(pool).then((reserves) => ({
      pair: pool.pair,
      reserves,
    }))
  );

  const results = await Promise.all(reservesPromises);

  return results.reduce(
    (acc, { pair, reserves }) => {
      acc[pair] = reserves;
      return acc;
    },
    {} as Record<string, CrossChainPoolReserves>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUOTE CALCULATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate output amount using contract's getAmountOut
 */
export async function getAmountOut(
  pool: CrossChainPool,
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): Promise<bigint> {
  if (amountIn === ZERO || reserveIn === ZERO || reserveOut === ZERO) {
    return ZERO;
  }

  try {
    const amountOut = await publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'getAmountOut',
      args: [amountIn, reserveIn, reserveOut],
    });
    return amountOut as bigint;
  } catch {
    // Fallback to local calculation
    return calculateOutputAmountLocal(amountIn, reserveIn, reserveOut);
  }
}

/**
 * Local calculation of output amount (constant product formula)
 */
function calculateOutputAmountLocal(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountIn === ZERO || reserveIn === ZERO || reserveOut === ZERO) {
    return ZERO;
  }

  // Apply 0.3% fee
  const amountInWithFee = amountIn * BigInt(997);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BigInt(1000) + amountInWithFee;

  return numerator / denominator;
}

/**
 * Estimate cross-chain swap output using contract
 */
export async function estimateCrossChainSwapOutput(
  pool: CrossChainPool,
  amountIn: bigint
): Promise<bigint> {
  if (amountIn === ZERO) return ZERO;

  try {
    const amountOut = await publicClient.readContract({
      address: pool.address,
      abi: CROSS_CHAIN_POOL_ABI,
      functionName: 'estimateCrossChainSwap',
      args: [amountIn],
    });
    return amountOut as bigint;
  } catch {
    // Fallback: calculate manually with 0.4% fee
    const reserves = await getCrossChainPoolReserves(pool);
    const swapOutput = calculateOutputAmountLocal(
      amountIn,
      reserves.reserve0,
      reserves.reserve1
    );
    return calculateAmountAfterFee(
      swapOutput,
      CROSS_CHAIN_FEES.CROSS_CHAIN_TRANSFER_FEE_BPS
    );
  }
}

/**
 * Calculate price impact
 */
export function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  inputDecimals: number,
  outputDecimals: number
): number {
  if (
    amountIn === ZERO ||
    amountOut === ZERO ||
    reserveIn === ZERO ||
    reserveOut === ZERO
  ) {
    return 0;
  }

  const inputNormalized = Number(amountIn) / 10 ** inputDecimals;
  const outputNormalized = Number(amountOut) / 10 ** outputDecimals;
  const reserveInNormalized = Number(reserveIn) / 10 ** inputDecimals;
  const reserveOutNormalized = Number(reserveOut) / 10 ** outputDecimals;

  const spotPrice = reserveOutNormalized / reserveInNormalized;
  const effectivePrice = outputNormalized / inputNormalized;

  const priceImpact = ((spotPrice - effectivePrice) / spotPrice) * 100;

  return Math.max(0, priceImpact);
}

/**
 * Calculate minimum received after slippage
 */
export function calculateMinimumReceived(
  amountOut: bigint,
  slippagePercent: number
): bigint {
  if (amountOut === ZERO) return ZERO;

  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  return (amountOut * (BPS_BASE - slippageBps)) / BPS_BASE;
}

// ═══════════════════════════════════════════════════════════════
// QUOTE GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Get quote for same-chain swap
 */
export async function getSwapQuote(
  tokenIn: PoolToken,
  tokenOut: PoolToken,
  amountIn: bigint,
  slippagePercent: number = 0.5
): Promise<CrossChainSwapQuote | null> {
  const pool = getCrossChainPool(tokenIn.symbol, tokenOut.symbol);
  if (!pool) return null;

  const reserves = await getCrossChainPoolReserves(pool);

  // Determine reserve order based on input token
  const isToken0 =
    tokenIn.address.toLowerCase() === reserves.token0.toLowerCase();
  const reserveIn = isToken0 ? reserves.reserve0 : reserves.reserve1;
  const reserveOut = isToken0 ? reserves.reserve1 : reserves.reserve0;

  const amountOut = await getAmountOut(pool, amountIn, reserveIn, reserveOut);
  const minAmountOut = calculateMinimumReceived(amountOut, slippagePercent);
  const priceImpact = calculatePriceImpact(
    amountIn,
    amountOut,
    reserveIn,
    reserveOut,
    tokenIn.decimals,
    tokenOut.decimals
  );

  const feeAmount = calculateFee(amountIn, CROSS_CHAIN_FEES.SWAP_FEE_BPS);

  return {
    type: 'swap',
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    minAmountOut,
    priceImpact,
    feeAmount,
    feeBps: CROSS_CHAIN_FEES.SWAP_FEE_BPS,
    pool,
  };
}

/**
 * Get quote for cross-chain transfer
 */
export async function getTransferQuote(
  token: PoolToken,
  amount: bigint,
  destChainId: ChainId
): Promise<CrossChainTransferQuote | null> {
  // Find a pool that supports this token
  const pool =
    getCrossChainPool(token.symbol, 'USDT') ||
    getCrossChainPool(token.symbol, 'ETH') ||
    getCrossChainPool(token.symbol, 'EURC');

  if (!pool) return null;

  // Check if destination chain is supported
  const isSupported = await isChainSupportedByPool(pool, destChainId);
  if (!isSupported) return null;

  const feeAmount = calculateFee(
    amount,
    CROSS_CHAIN_FEES.CROSS_CHAIN_TRANSFER_FEE_BPS
  );
  const amountOut = amount - feeAmount;

  return {
    type: 'transfer',
    token,
    sourceChainId: CHAIN_IDS.SEPOLIA,
    destChainId,
    amountIn: amount,
    amountOut,
    feeAmount,
    feeBps: CROSS_CHAIN_FEES.CROSS_CHAIN_TRANSFER_FEE_BPS,
    pool,
  };
}

/**
 * Get quote for cross-chain swap
 */
export async function getCrossChainSwapQuote(
  tokenIn: PoolToken,
  tokenOut: PoolToken,
  amountIn: bigint,
  destChainId: ChainId,
  slippagePercent: number = 0.5
): Promise<CrossChainCrossSwapQuote | null> {
  const pool = getCrossChainPool(tokenIn.symbol, tokenOut.symbol);
  if (!pool) return null;

  // Check if destination chain is supported
  const isSupported = await isChainSupportedByPool(pool, destChainId);
  if (!isSupported) return null;

  // Get estimated output from contract
  const amountOut = await estimateCrossChainSwapOutput(pool, amountIn);
  const minAmountOut = calculateMinimumReceived(amountOut, slippagePercent);

  // Calculate price impact
  const reserves = await getCrossChainPoolReserves(pool);
  const isToken0 =
    tokenIn.address.toLowerCase() === reserves.token0.toLowerCase();
  const reserveIn = isToken0 ? reserves.reserve0 : reserves.reserve1;
  const reserveOut = isToken0 ? reserves.reserve1 : reserves.reserve0;

  const priceImpact = calculatePriceImpact(
    amountIn,
    amountOut,
    reserveIn,
    reserveOut,
    tokenIn.decimals,
    tokenOut.decimals
  );

  const feeAmount = calculateFee(
    amountIn,
    CROSS_CHAIN_FEES.CROSS_CHAIN_SWAP_FEE_BPS
  );

  return {
    type: 'cross_chain_swap',
    tokenIn,
    tokenOut,
    sourceChainId: CHAIN_IDS.SEPOLIA,
    destChainId,
    amountIn,
    amountOut,
    minAmountOut,
    priceImpact,
    feeAmount,
    feeBps: CROSS_CHAIN_FEES.CROSS_CHAIN_SWAP_FEE_BPS,
    pool,
  };
}

// ═══════════════════════════════════════════════════════════════
// TOKEN OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get token balance
 */
export async function getTokenBalance(
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`
): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [ownerAddress],
  });

  return balance as bigint;
}

/**
 * Get token allowance
 */
export async function getTokenAllowance(
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`
): Promise<bigint> {
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  });

  return allowance as bigint;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  displayDecimals: number = 6
): string {
  if (amount === ZERO) return '0';

  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.slice(0, displayDecimals);

  if (trimmedFractional === '0'.repeat(displayDecimals)) {
    return integerPart.toString();
  }

  const cleanedFractional = trimmedFractional.replace(/0+$/, '');
  return `${integerPart}.${cleanedFractional}`;
}

/**
 * Parse token amount from string
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!amount || amount === '' || amount === '.') return ZERO;

  const [integerPart, fractionalPart = ''] = amount.split('.');
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const combined = integerPart + paddedFractional;

  return BigInt(combined || '0');
}

/**
 * Get the public client instance
 */
export function getCrossChainPublicClient(): PublicClient {
  return publicClient;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  CROSS_CHAIN_POOLS,
  CROSS_CHAIN_TOKENS,
  CHAIN_IDS,
  CROSS_CHAIN_FEES,
};
