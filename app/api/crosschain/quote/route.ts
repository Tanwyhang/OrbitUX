/**
 * Cross-Chain Quote API
 * 
 * GET /api/crosschain/quote
 * 
 * Query params:
 * - tokenIn: Token symbol (ETH, USDT, EURC)
 * - tokenOut: Token symbol (ETH, USDT, EURC)
 * - amountIn: Amount in wei (string)
 * - destChainId: Optional destination chain ID
 * - slippage: Optional slippage percentage (default 0.5)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CROSS_CHAIN_TOKENS,
  CHAIN_IDS,
} from '@/lib/swap/crossChainConfig';
import {
  getSwapQuote,
  getTransferQuote,
  getCrossChainSwapQuote,
  formatTokenAmount,
} from '@/lib/swap/crossChainPoolService';
import type { TokenSymbol } from '@/lib/swap/types';
import type { ChainId } from '@/lib/swap/crossChainTypes';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const tokenInSymbol = searchParams.get('tokenIn') as TokenSymbol | null;
    const tokenOutSymbol = searchParams.get('tokenOut') as TokenSymbol | null;
    const amountInStr = searchParams.get('amountIn');
    const destChainIdStr = searchParams.get('destChainId');
    const slippageStr = searchParams.get('slippage');
    
    // Validate required params
    if (!tokenInSymbol || !tokenOutSymbol || !amountInStr) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenIn, tokenOut, amountIn' },
        { status: 400 }
      );
    }
    
    // Validate tokens
    const tokenIn = CROSS_CHAIN_TOKENS[tokenInSymbol];
    const tokenOut = CROSS_CHAIN_TOKENS[tokenOutSymbol];
    
    if (!tokenIn || !tokenOut) {
      return NextResponse.json(
        { error: 'Invalid token symbol. Supported: ETH, USDT, EURC' },
        { status: 400 }
      );
    }
    
    // Parse amount
    let amountIn: bigint;
    try {
      amountIn = BigInt(amountInStr);
    } catch {
      return NextResponse.json(
        { error: 'Invalid amountIn format' },
        { status: 400 }
      );
    }
    
    if (amountIn <= BigInt(0)) {
      return NextResponse.json(
        { error: 'amountIn must be greater than 0' },
        { status: 400 }
      );
    }
    
    // Parse optional params
    const destChainId = destChainIdStr ? (parseInt(destChainIdStr) as ChainId) : undefined;
    const slippage = slippageStr ? parseFloat(slippageStr) : 0.5;
    
    // Get appropriate quote
    let quote;
    
    if (!destChainId || destChainId === CHAIN_IDS.SEPOLIA) {
      // Same-chain swap
      quote = await getSwapQuote(tokenIn, tokenOut, amountIn, slippage);
    } else if (tokenInSymbol === tokenOutSymbol) {
      // Cross-chain transfer
      quote = await getTransferQuote(tokenIn, amountIn, destChainId);
    } else {
      // Cross-chain swap
      quote = await getCrossChainSwapQuote(
        tokenIn,
        tokenOut,
        amountIn,
        destChainId,
        slippage
      );
    }
    
    if (!quote) {
      return NextResponse.json(
        { error: 'No route found for this trade' },
        { status: 404 }
      );
    }
    
    // Format response
    const response = {
      type: quote.type,
      tokenIn: {
        symbol: tokenIn.symbol,
        address: tokenIn.address,
        decimals: tokenIn.decimals,
      },
      tokenOut: {
        symbol: tokenOut.symbol,
        address: tokenOut.address,
        decimals: tokenOut.decimals,
      },
      amountIn: amountIn.toString(),
      amountInFormatted: formatTokenAmount(amountIn, tokenIn.decimals),
      amountOut: quote.amountOut.toString(),
      amountOutFormatted: formatTokenAmount(quote.amountOut, tokenOut.decimals),
      feeAmount: quote.feeAmount.toString(),
      feeBps: quote.feeBps,
      feePercent: (quote.feeBps / 100).toFixed(2) + '%',
      pool: {
        address: quote.pool.address,
        pair: quote.pool.pair,
      },
      ...(quote.type === 'swap' && {
        minAmountOut: quote.minAmountOut.toString(),
        minAmountOutFormatted: formatTokenAmount(quote.minAmountOut, tokenOut.decimals),
        priceImpact: quote.priceImpact.toFixed(4) + '%',
      }),
      ...(quote.type === 'transfer' && {
        sourceChainId: quote.sourceChainId,
        destChainId: quote.destChainId,
      }),
      ...(quote.type === 'cross_chain_swap' && {
        sourceChainId: quote.sourceChainId,
        destChainId: quote.destChainId,
        minAmountOut: quote.minAmountOut.toString(),
        minAmountOutFormatted: formatTokenAmount(quote.minAmountOut, tokenOut.decimals),
        priceImpact: quote.priceImpact.toFixed(4) + '%',
      }),
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[CrossChain Quote API Error]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
