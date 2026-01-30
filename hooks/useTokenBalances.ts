'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import type { PoolToken, TokenSymbol } from '@/lib/swap/types';
import { TOKEN_LIST, getTokenBalance } from '@/lib/swap';

interface UseTokenBalancesResult {
  balances: Record<TokenSymbol, bigint>;
  isLoading: boolean;
  refetch: () => void;
}

const ZERO = BigInt(0);

export function useTokenBalances(): UseTokenBalancesResult {
  const { address, isConnected } = useAccount();
  const [balances, setBalances] = useState<Record<TokenSymbol, bigint>>({
    ETH: ZERO,
    USDT: ZERO,
    EURC: ZERO,
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!address || !isConnected) {
      setBalances({ ETH: ZERO, USDT: ZERO, EURC: ZERO });
      return;
    }

    setIsLoading(true);

    try {
      const results = await Promise.all(
        TOKEN_LIST.map(async (token) => {
          const balance = await getTokenBalance(token.address, address);
          return { symbol: token.symbol, balance };
        })
      );

      const newBalances: Record<TokenSymbol, bigint> = {
        ETH: ZERO,
        USDT: ZERO,
        EURC: ZERO,
      };

      for (const { symbol, balance } of results) {
        newBalances[symbol] = balance;
      }

      setBalances(newBalances);
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return {
    balances,
    isLoading,
    refetch: fetchBalances,
  };
}
