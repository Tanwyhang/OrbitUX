/**
 * Uniswap v3 Quote Service
 * Fetches quotes directly from Uniswap v3 Quoter contract
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { arbitrum, polygon } from 'viem/chains';
import type { TokenConfig } from '@/lib/swap/unifiedConfig';
import { getUniswapQuoterAddress, getUniswapFactoryAddress } from '@/lib/swap/unifiedConfig';
import type { UniswapQuote, QuoteOptions } from './uniswapTypes';
import type { SupportedChainId } from '@/lib/swap/unifiedConfig';

// ============================================================================
// RPC Configuration (Arbitrum & Polygon only)
// ============================================================================

const RPC_URLS: Record<SupportedChainId, string> = {
  42161: 'https://arb1.arbitrum.io/rpc',
  137: 'https://polygon-rpc.com',
} as const;

// ============================================================================
// Uniswap V3 Quoter V2 ABI
// ============================================================================

const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'quoteExactInputSingle',
        outputs: [
          { name: 'amountOut', type: 'uint256' },
          { name: 'sqrtPriceX96After', type: 'uint160' },
          { name: 'initializedTicksCrossed', type: 'uint32' },
          { name: 'gasEstimate', type: 'uint256' },
        ],
        stateMutability: 'function',
        type: 'function',
      },
    ],
  },
] as const;

// Pool ABI for getting liquidity
const POOL_ABI = [
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// V3 Factory ABI for computing pool address
const FACTORY_ABI = [
  {
    inputs: [
      { name: 'fee', type: 'uint24' },
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Fee tiers: 0.05%, 0.3%, 1%
const FEE_TIERS = [500, 3000, 10000] as const;

// ============================================================================
// Public Client Cache
// ============================================================================

const publicClients: Record<SupportedChainId, PublicClient> = {
  42161: createPublicClient({ chain: arbitrum, transport: http(RPC_URLS[42161]) }),
  137: createPublicClient({ chain: polygon, transport: http(RPC_URLS[137]) }),
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get pool address for a token pair and fee tier
 */
async function getPoolAddress(
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
  fee: bigint,
  chainId: SupportedChainId
): Promise<`0x${string}` | null> {
  const client = publicClients[chainId];

  try {
    // Sort tokens (Uniswap requires addresses to be sorted)
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    const pool = await client.readContract({
      address: getUniswapFactoryAddress(chainId),
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [Number(fee), token0, token1],
    }) as `0x${string}`;

    return pool;
  } catch {
    return null;
  }
}

/**
 * Calculate execution price
 */
function calculateExecutionPrice(
  inputAmount: bigint,
  outputAmount: bigint,
  inputDecimals: number,
  outputDecimals: number
): number {
  if (inputAmount === BigInt(0)) return 0;
  const inputNormalized = Number(inputAmount) / Math.pow(10, inputDecimals);
  const outputNormalized = Number(outputAmount) / Math.pow(10, outputDecimals);
  return outputNormalized / inputNormalized;
}

/**
 * Calculate minimum received after slippage
 */
function calculateMinimumReceived(
  outputAmount: bigint,
  slippagePercent: number
): bigint {
  if (outputAmount === BigInt(0)) return BigInt(0);
  const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 10000));
  const divisor = BigInt(1000000);
  return (outputAmount * slippageMultiplier) / divisor;
}

/**
 * Calculate price impact (simplified)
 */
function calculatePriceImpact(
  outputAmount: bigint,
  liquidity: bigint
): number {
  if (liquidity === BigInt(0)) return 0;
  // Simplified price impact calculation
  const impact = (Number(outputAmount) / Number(liquidity)) * 100;
  return Math.min(impact, 100);
}

// ============================================================================
// Main Quote Function
// ============================================================================

/**
 * Get a quote for swapping tokens on Uniswap v3
 */
export async function getUniswapQuote(
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  options: QuoteOptions
): Promise<UniswapQuote | null> {
  // Validate inputs
  if (amountIn <= BigInt(0)) {
    throw new Error('Amount must be greater than 0');
  }

  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
    throw new Error('Cannot swap token for itself');
  }

  if (tokenIn.chainId !== tokenOut.chainId) {
    throw new Error('Cannot quote cross-chain swap with getUniswapQuote. Use getCrossChainQuote instead.');
  }

  const chainId = tokenIn.chainId;
  const client = publicClients[chainId];

  // Try each fee tier to find the best pool
  for (const fee of FEE_TIERS) {
    try {
      // Get pool address
      const poolAddress = await getPoolAddress(tokenIn.address, tokenOut.address, BigInt(fee), chainId);
      if (!poolAddress) continue;

      // Check if pool has liquidity
      const liquidity = await client.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'liquidity',
      }) as bigint;

      if (liquidity === BigInt(0)) continue;

      // Get quote from Quoter V2
      const result = await client.readContract({
        address: getUniswapQuoterAddress(chainId),
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee: Number(fee),
          amountIn,
          sqrtPriceLimitX96: BigInt(0),
        }],
      }) as readonly [bigint, bigint, number, bigint];

      const outputAmount = result[0];

      if (outputAmount === BigInt(0)) continue;

      // Calculate price info
      const executionPrice = calculateExecutionPrice(
        amountIn,
        outputAmount,
        tokenIn.decimals,
        tokenOut.decimals
      );

      const priceImpact = calculatePriceImpact(outputAmount, liquidity);
      const minimumReceived = calculateMinimumReceived(outputAmount, options.slippage);

      // Build quote
      const quote: UniswapQuote = {
        inputAmount: amountIn,
        outputAmount,
        inputToken: tokenIn,
        outputToken: tokenOut,
        tradeType: 'EXACT_INPUT',
        executionPrice,
        priceImpact,
        minimumReceived,
        slippage: options.slippage,
        route: {
          tokenPath: [tokenIn, tokenOut],
          poolFees: [Number(fee) / 10000], // Convert to percentage
        },
        estimatedGasUsed: result[3],
        timestamp: Date.now(),
      };

      return quote;

    } catch (error) {
      // Pool doesn't exist or quote failed, try next fee tier
      continue;
    }
  }

  // No pool found with liquidity
  return null;
}

/**
 * Get the best available quote
 */
export async function getBestQuote(
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  options: QuoteOptions
): Promise<UniswapQuote | null> {
  return await getUniswapQuote(tokenIn, tokenOut, amountIn, options);
}

// Export types
export type { UniswapQuote, QuoteOptions };
