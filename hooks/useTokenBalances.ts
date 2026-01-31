'use client';

/**
 * Token Balance Hook (Legacy - now uses unified config)
 * This hook is kept for backwards compatibility with existing components
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { SUPPORTED_CHAINS, getTokensForChain } from '@/lib/swap/unifiedConfig';
import type { TokenConfig } from '@/lib/swap/unifiedConfig';

interface UseTokenBalancesResult {
  balances: Record<string, bigint>;
  isLoading: boolean;
  refetch: () => void;
}

const ZERO = BigInt(0);

// ERC20 balanceOf ABI
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export function useTokenBalances(): UseTokenBalancesResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  // Use current chain if supported, default to Arbitrum (no more Sepolia fallback)
  const supportedChainId = Object.values(SUPPORTED_CHAINS).includes(chainId as any)
    ? (chainId as typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS])
    : SUPPORTED_CHAINS.ARBITRUM;

  const tokenList = getTokensForChain(supportedChainId);

  const [balances, setBalances] = useState<Record<string, bigint>>(() => {
    const initial: Record<string, bigint> = {};
    tokenList.forEach(t => initial[t.symbol] = ZERO);
    return initial;
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!address || !isConnected || !publicClient) {
      const empty: Record<string, bigint> = {};
      tokenList.forEach(t => empty[t.symbol] = ZERO);
      setBalances(empty);
      return;
    }

    setIsLoading(true);

    try {
      const newBalances: Record<string, bigint> = {};

      for (const token of tokenList) {
        try {
          if (token.symbol === 'ETH' || token.symbol === 'WETH') {
            // For native ETH, get balance directly
            const balance = await publicClient.getBalance({ address });
            newBalances[token.symbol] = balance;
          } else {
            // For ERC20 tokens, call balanceOf
            const balance = await publicClient.readContract({
              address: token.address,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as bigint;
            newBalances[token.symbol] = balance;
          }
        } catch (error) {
          console.error(`Failed to fetch balance for ${token.symbol}:`, error);
          newBalances[token.symbol] = ZERO;
        }
      }

      setBalances(newBalances);
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, publicClient, tokenList]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return {
    balances,
    isLoading,
    refetch: fetchBalances,
  };
}
