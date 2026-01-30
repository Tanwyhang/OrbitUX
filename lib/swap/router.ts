import type { Pool, PoolToken, SwapRoute, SwapQuote, TokenSymbol } from './types';
import { POOLS, TOKENS, DEFAULT_SLIPPAGE } from './config';
import {
  getPoolReserves,
  calculateOutputAmount,
  calculatePriceImpact,
  calculateMinimumReceived,
  getOrderedReserves,
} from './poolService';

// BigInt constants
const ZERO = BigInt(0);

/**
 * Find the pool that contains both tokens (if exists)
 */
function findDirectPool(
  fromToken: PoolToken,
  toToken: PoolToken
): Pool | null {
  const fromAddr = fromToken.address.toLowerCase();
  const toAddr = toToken.address.toLowerCase();

  for (const pool of Object.values(POOLS)) {
    const token0Addr = pool.token0.address.toLowerCase();
    const token1Addr = pool.token1.address.toLowerCase();

    if (
      (token0Addr === fromAddr && token1Addr === toAddr) ||
      (token0Addr === toAddr && token1Addr === fromAddr)
    ) {
      return pool;
    }
  }

  return null;
}

/**
 * Find route between two tokens
 * Supports direct routes and multi-hop through USDT
 */
export function findRoute(
  fromToken: PoolToken,
  toToken: PoolToken
): SwapRoute | null {
  // Same token - no swap needed
  if (fromToken.symbol === toToken.symbol) {
    return null;
  }

  // Try direct pool first
  const directPool = findDirectPool(fromToken, toToken);
  if (directPool) {
    return {
      path: [fromToken, toToken],
      pools: [directPool],
      isMultiHop: false,
    };
  }

  // Try routing through USDT
  const usdtToken = TOKENS.USDT;
  
  // Skip if either token is USDT (should have been found as direct)
  if (fromToken.symbol === 'USDT' || toToken.symbol === 'USDT') {
    return null;
  }

  const firstPool = findDirectPool(fromToken, usdtToken);
  const secondPool = findDirectPool(usdtToken, toToken);

  if (firstPool && secondPool) {
    return {
      path: [fromToken, usdtToken, toToken],
      pools: [firstPool, secondPool],
      isMultiHop: true,
    };
  }

  return null;
}

/**
 * Get all available routes and pick the best one
 * Compares direct route vs multi-hop to find better output
 */
export async function findBestRoute(
  fromToken: PoolToken,
  toToken: PoolToken,
  inputAmount: bigint
): Promise<{ route: SwapRoute; outputAmount: bigint } | null> {
  if (inputAmount === ZERO) {
    const route = findRoute(fromToken, toToken);
    return route ? { route, outputAmount: ZERO } : null;
  }

  // For ETH <-> EURC, compare direct vs via USDT
  if (
    (fromToken.symbol === 'ETH' && toToken.symbol === 'EURC') ||
    (fromToken.symbol === 'EURC' && toToken.symbol === 'ETH')
  ) {
    const [directResult, multiHopResult] = await Promise.all([
      getQuoteForRoute(
        {
          path: [fromToken, toToken],
          pools: [POOLS.ETH_EURC],
          isMultiHop: false,
        },
        inputAmount
      ),
      getQuoteForRoute(
        {
          path: [fromToken, TOKENS.USDT, toToken],
          pools: [
            fromToken.symbol === 'ETH' ? POOLS.ETH_USDT : POOLS.EURC_USDT,
            toToken.symbol === 'ETH' ? POOLS.ETH_USDT : POOLS.EURC_USDT,
          ],
          isMultiHop: true,
        },
        inputAmount
      ),
    ]);

    // Pick the route with better output
    if (directResult && multiHopResult) {
      return directResult.outputAmount >= multiHopResult.outputAmount
        ? directResult
        : multiHopResult;
    }
    return directResult || multiHopResult;
  }

  // For other pairs, use the standard route
  const route = findRoute(fromToken, toToken);
  if (!route) return null;

  return getQuoteForRoute(route, inputAmount);
}

/**
 * Calculate output for a specific route
 */
async function getQuoteForRoute(
  route: SwapRoute,
  inputAmount: bigint
): Promise<{ route: SwapRoute; outputAmount: bigint } | null> {
  try {
    let currentAmount = inputAmount;

    for (let i = 0; i < route.pools.length; i++) {
      const pool = route.pools[i];
      const fromToken = route.path[i];

      const reserves = await getPoolReserves(pool);
      const { reserveIn, reserveOut } = getOrderedReserves(reserves, fromToken, pool);

      currentAmount = calculateOutputAmount(currentAmount, reserveIn, reserveOut);

      if (currentAmount === ZERO) {
        return null;
      }
    }

    return { route, outputAmount: currentAmount };
  } catch (error) {
    console.error('Error calculating route quote:', error);
    return null;
  }
}

/**
 * Get a complete swap quote with all details
 */
export async function getQuote(
  fromToken: PoolToken,
  toToken: PoolToken,
  inputAmount: bigint,
  slippage: number = DEFAULT_SLIPPAGE
): Promise<SwapQuote | null> {
  if (fromToken.symbol === toToken.symbol) {
    return null;
  }

  const bestRoute = await findBestRoute(fromToken, toToken, inputAmount);
  if (!bestRoute) {
    return null;
  }

  const { route, outputAmount } = bestRoute;

  // Calculate price impact for the full route
  let totalPriceImpact = 0;
  let currentAmount = inputAmount;

  for (let i = 0; i < route.pools.length; i++) {
    const pool = route.pools[i];
    const currentFromToken = route.path[i];
    const currentToToken = route.path[i + 1];

    const reserves = await getPoolReserves(pool);
    const { reserveIn, reserveOut } = getOrderedReserves(reserves, currentFromToken, pool);

    const stepOutput = calculateOutputAmount(currentAmount, reserveIn, reserveOut);
    
    const stepImpact = calculatePriceImpact(
      currentAmount,
      stepOutput,
      reserveIn,
      reserveOut,
      currentFromToken.decimals,
      currentToToken.decimals
    );

    totalPriceImpact += stepImpact;
    currentAmount = stepOutput;
  }

  const minimumReceived = calculateMinimumReceived(outputAmount, slippage);

  // Calculate execution price (output per input)
  const inputNormalized = Number(inputAmount) / (10 ** fromToken.decimals);
  const outputNormalized = Number(outputAmount) / (10 ** toToken.decimals);
  const executionPrice = inputNormalized > 0 ? outputNormalized / inputNormalized : 0;

  return {
    route,
    inputAmount,
    outputAmount,
    priceImpact: totalPriceImpact,
    minimumReceived,
    slippage,
    executionPrice,
  };
}

/**
 * Get the route path as a string for display
 */
export function formatRoutePath(route: SwapRoute): string {
  return route.path.map((token) => token.symbol).join(' → ');
}

/**
 * Check if a trading pair exists
 */
export function hasTradingPair(
  fromSymbol: TokenSymbol,
  toSymbol: TokenSymbol
): boolean {
  if (fromSymbol === toSymbol) return false;
  
  const fromToken = TOKENS[fromSymbol];
  const toToken = TOKENS[toSymbol];
  
  return findRoute(fromToken, toToken) !== null;
}
