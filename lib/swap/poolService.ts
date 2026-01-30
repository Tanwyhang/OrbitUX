import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import type { Pool, PoolReserves, PoolToken } from './types';
import { SWAP_RPC_URL, POOL_ABI, ERC20_ABI } from './config';

// BigInt constants
const ZERO = BigInt(0);
const ONE = BigInt(1);
const BPS_BASE = BigInt(10000);

// Create a public client for read operations
const publicClient: PublicClient = createPublicClient({
  chain: sepolia,
  transport: http(SWAP_RPC_URL),
});

/**
 * Get pool reserves
 */
export async function getPoolReserves(pool: Pool): Promise<PoolReserves> {
  const [reserve0, reserve1, token0, token1] = await Promise.all([
    publicClient.readContract({
      address: pool.address,
      abi: POOL_ABI,
      functionName: 'reserve0',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: pool.address,
      abi: POOL_ABI,
      functionName: 'reserve1',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: pool.address,
      abi: POOL_ABI,
      functionName: 'token0',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: pool.address,
      abi: POOL_ABI,
      functionName: 'token1',
    }) as Promise<`0x${string}`>,
  ]);

  return { reserve0, reserve1, token0, token1 };
}

/**
 * Calculate expected output amount using constant product formula
 * Formula: outputAmount = (inputAmount * reserveOut) / (reserveIn + inputAmount)
 * This is a simplified version without fees
 */
export function calculateOutputAmount(
  inputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (inputAmount === ZERO || reserveIn === ZERO || reserveOut === ZERO) {
    return ZERO;
  }
  
  // Using constant product formula: x * y = k
  // After swap: (reserveIn + inputAmount) * (reserveOut - outputAmount) = k
  // Solving for outputAmount: outputAmount = (inputAmount * reserveOut) / (reserveIn + inputAmount)
  const numerator = inputAmount * reserveOut;
  const denominator = reserveIn + inputAmount;
  
  return numerator / denominator;
}

/**
 * Calculate required input amount for a desired output
 * Formula: inputAmount = (reserveIn * outputAmount) / (reserveOut - outputAmount)
 */
export function calculateInputAmount(
  outputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (outputAmount === ZERO || reserveIn === ZERO || reserveOut === ZERO) {
    return ZERO;
  }
  
  if (outputAmount >= reserveOut) {
    throw new Error('Insufficient liquidity for desired output');
  }
  
  const numerator = reserveIn * outputAmount;
  const denominator = reserveOut - outputAmount;
  
  // Add 1 to round up
  return (numerator / denominator) + ONE;
}

/**
 * Calculate price impact as a percentage
 * Price impact = ((effective price - spot price) / spot price) * 100
 */
export function calculatePriceImpact(
  inputAmount: bigint,
  outputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  inputDecimals: number,
  outputDecimals: number
): number {
  if (inputAmount === ZERO || outputAmount === ZERO || reserveIn === ZERO || reserveOut === ZERO) {
    return 0;
  }
  
  // Normalize to same decimals for comparison
  const inputNormalized = Number(inputAmount) / (10 ** inputDecimals);
  const outputNormalized = Number(outputAmount) / (10 ** outputDecimals);
  const reserveInNormalized = Number(reserveIn) / (10 ** inputDecimals);
  const reserveOutNormalized = Number(reserveOut) / (10 ** outputDecimals);
  
  // Spot price (price with infinitesimally small trade)
  const spotPrice = reserveOutNormalized / reserveInNormalized;
  
  // Effective price (actual rate for this trade)
  const effectivePrice = outputNormalized / inputNormalized;
  
  // Price impact as percentage
  const priceImpact = ((spotPrice - effectivePrice) / spotPrice) * 100;
  
  return Math.max(0, priceImpact);
}

/**
 * Calculate minimum received after slippage
 */
export function calculateMinimumReceived(
  outputAmount: bigint,
  slippagePercent: number
): bigint {
  if (outputAmount === ZERO) return ZERO;
  
  // slippagePercent is 0-100, convert to basis points for precision
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  
  return (outputAmount * (BPS_BASE - slippageBps)) / BPS_BASE;
}

/**
 * Get token balance for an address
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

/**
 * Determine if input token is token0 or token1 in pool
 */
export function getTokenPosition(
  inputToken: PoolToken,
  pool: Pool
): 'token0' | 'token1' {
  if (inputToken.address.toLowerCase() === pool.token0.address.toLowerCase()) {
    return 'token0';
  } else if (inputToken.address.toLowerCase() === pool.token1.address.toLowerCase()) {
    return 'token1';
  }
  throw new Error(`Token ${inputToken.symbol} not found in pool ${pool.pair}`);
}

/**
 * Get reserves ordered by input/output token
 * Uses the actual token addresses from the pool reserves to determine order
 */
export function getOrderedReserves(
  reserves: PoolReserves,
  inputToken: PoolToken,
  _pool: Pool
): { reserveIn: bigint; reserveOut: bigint } {
  // Compare against the actual token0/token1 from the contract (in reserves)
  const inputAddr = inputToken.address.toLowerCase();
  const token0Addr = reserves.token0.toLowerCase();
  
  if (inputAddr === token0Addr) {
    // Input is token0, so reserveIn = reserve0, reserveOut = reserve1
    return { reserveIn: reserves.reserve0, reserveOut: reserves.reserve1 };
  } else {
    // Input is token1, so reserveIn = reserve1, reserveOut = reserve0
    return { reserveIn: reserves.reserve1, reserveOut: reserves.reserve0 };
  }
}

/**
 * Format amount with decimals for display
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
  
  // Remove trailing zeros
  const cleanedFractional = trimmedFractional.replace(/0+$/, '');
  
  return `${integerPart}.${cleanedFractional}`;
}

/**
 * Parse user input amount to bigint
 */
export function parseTokenAmount(
  amount: string,
  decimals: number
): bigint {
  if (!amount || amount === '' || amount === '.') return ZERO;
  
  const [integerPart, fractionalPart = ''] = amount.split('.');
  
  // Pad or truncate fractional part to match decimals
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  
  const combined = integerPart + paddedFractional;
  
  return BigInt(combined || '0');
}

/**
 * Get the public client instance
 */
export function getPublicClient(): PublicClient {
  return publicClient;
}
