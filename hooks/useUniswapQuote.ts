'use client';

/**
 * Uniswap v3 Quote Hook
 * Manages quotes for Uniswap v3 swaps
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TokenConfig } from '@/lib/swap/unifiedConfig';
import type { UniswapQuote, QuoteOptions } from '@/lib/swap/uniswap/uniswapTypes';
import { getBestQuote } from '@/lib/swap/uniswap/uniswapQuoteService';

interface UseUniswapQuoteParams {
  fromToken: TokenConfig | null;
  toToken: TokenConfig | null;
  inputAmount: string;
  slippage: number;
  enabled?: boolean;
}

interface UseUniswapQuoteResult {
  quote: UniswapQuote | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Debounce delay for quote requests (ms)
const QUOTE_DEBOUNCE_DELAY = 300;

// Auto-refresh interval (ms)
const QUOTE_REFRESH_INTERVAL = 30000; // 30 seconds

export function useUniswapQuote({
  fromToken,
  toToken,
  inputAmount,
  slippage,
  enabled = true,
}: UseUniswapQuoteParams): UseUniswapQuoteResult {
  const [quote, setQuote] = useState<UniswapQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !enabled) {
      setQuote(null);
      setError(null);
      return;
    }

    // Skip if same token
    if (fromToken.address.toLowerCase() === toToken.address.toLowerCase()) {
      setQuote(null);
      setError(null);
      return;
    }

    // Parse input amount
    const inputAmountBigInt = BigInt(Math.floor(parseFloat(inputAmount || '0') * Math.pow(10, fromToken.decimals)));

    if (inputAmountBigInt <= BigInt(0)) {
      setQuote(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const options: QuoteOptions = {
        slippage,
        maxHops: 3,
      };

      const result = await getBestQuote(fromToken, toToken, inputAmountBigInt, options);

      if (!mountedRef.current) return;

      if (result) {
        setQuote(result);
        setError(null);
      } else {
        setQuote(null);
        setError(new Error('No route available for this swap'));
      }
    } catch (err) {
      if (!mountedRef.current) return;

      setQuote(null);
      setError(err instanceof Error ? err : new Error('Failed to fetch quote'));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fromToken, toToken, inputAmount, slippage, enabled]);

  // Debounced fetch on input changes
  useEffect(() => {
    // Clear previous timers
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (refreshRef.current) {
      clearInterval(refreshRef.current);
    }

    // Set new debounce timer
    debounceRef.current = setTimeout(() => {
      fetchQuote();

      // Set up auto-refresh after initial fetch
      refreshRef.current = setInterval(fetchQuote, QUOTE_REFRESH_INTERVAL);
    }, QUOTE_DEBOUNCE_DELAY);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (refreshRef.current) {
        clearInterval(refreshRef.current);
      }
    };
  }, [fetchQuote]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
    // Clear debounce and fetch immediately
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    fetchQuote();
  }, [fetchQuote]);

  return {
    quote,
    isLoading,
    error,
    refetch,
  };
}
