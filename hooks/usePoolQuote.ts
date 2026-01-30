'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoolToken, SwapQuote } from '@/lib/swap/types';
import { getQuote, parseTokenAmount, QUOTE_DEBOUNCE_DELAY, QUOTE_REFRESH_INTERVAL } from '@/lib/swap';

interface UsePoolQuoteParams {
  fromToken: PoolToken | null;
  toToken: PoolToken | null;
  inputAmount: string;
  slippage: number;
  enabled?: boolean;
}

interface UsePoolQuoteResult {
  quote: SwapQuote | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePoolQuote({
  fromToken,
  toToken,
  inputAmount,
  slippage,
  enabled = true,
}: UsePoolQuoteParams): UsePoolQuoteResult {
  const [quote, setQuote] = useState<SwapQuote | null>(null);
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

    if (fromToken.symbol === toToken.symbol) {
      setQuote(null);
      setError(null);
      return;
    }

    const parsedAmount = parseTokenAmount(inputAmount, fromToken.decimals);
    
    if (parsedAmount === BigInt(0)) {
      setQuote(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getQuote(fromToken, toToken, parsedAmount, slippage);
      
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
    // Clear previous debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Clear previous refresh timer
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
