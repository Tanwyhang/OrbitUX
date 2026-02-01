/**
 * Cross-Chain Reserves API
 * 
 * GET /api/crosschain/reserves
 * 
 * Returns current reserves for all cross-chain pools
 */

import { NextResponse } from 'next/server';
import {
  getAllPoolReserves,
  formatTokenAmount,
  CROSS_CHAIN_POOLS,
} from '@/lib/swap/crossChainPoolService';
import { CHAIN_IDS, CHAIN_NAMES } from '@/lib/swap/crossChainConfig';

export async function GET() {
  try {
    const reserves = await getAllPoolReserves();
    
    const formattedReserves = Object.entries(reserves).map(([pair, poolReserves]) => {
      const pool = CROSS_CHAIN_POOLS[pair as keyof typeof CROSS_CHAIN_POOLS];
      
      return {
        pair,
        pool: {
          address: pool.address,
          token0: {
            symbol: pool.token0.symbol,
            address: pool.token0.address,
          },
          token1: {
            symbol: pool.token1.symbol,
            address: pool.token1.address,
          },
          supportedChains: pool.supportedChains.map((chainId: number) => ({
            chainId,
            name: CHAIN_NAMES[chainId] || `Chain ${chainId}`,
          })),
        },
        reserves: {
          reserve0: poolReserves.reserve0.toString(),
          reserve0Formatted: formatTokenAmount(poolReserves.reserve0, pool.token0.decimals),
          reserve1: poolReserves.reserve1.toString(),
          reserve1Formatted: formatTokenAmount(poolReserves.reserve1, pool.token1.decimals),
          token0: poolReserves.token0,
          token1: poolReserves.token1,
        },
        chainId: poolReserves.chainId,
        chainName: CHAIN_NAMES[poolReserves.chainId] || 'Unknown',
      };
    });
    
    return NextResponse.json({
      sourceChain: {
        id: CHAIN_IDS.SEPOLIA,
        name: CHAIN_NAMES[CHAIN_IDS.SEPOLIA],
      },
      pools: formattedReserves,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CrossChain Reserves API Error]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
