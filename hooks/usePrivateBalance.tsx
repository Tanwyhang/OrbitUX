'use client';

import { useState, useCallback, useEffect } from 'react';
import { formatUnits } from 'ethers';
import { useRailgunWallet } from './useRailgunWallet';
import { TOKENS } from '@/lib/wagmi';

/**
 * Private Balance Hook
 * 
 * Tracks shielded token balances in the RAILGUN wallet via API.
 */

export interface TokenBalance {
  tokenAddress: string;
  symbol: string;
  decimals: number;
  totalBalance: bigint;
  spendableBalance: bigint;
  formattedTotal: string;
  formattedSpendable: string;
}

interface PrivateBalanceState {
  balances: Map<string, TokenBalance>;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const TOKEN_METADATA: Record<string, { symbol: string; decimals: number }> = {
  [TOKENS.USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  [TOKENS.WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
};

export function usePrivateBalance() {
  const { wallet, status: walletStatus } = useRailgunWallet();
  
  const [state, setState] = useState<PrivateBalanceState>({
    balances: new Map(),
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  const refreshBalances = useCallback(async () => {
    if (!wallet || walletStatus !== 'ready') {
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const newBalances = new Map<string, TokenBalance>();
      
      // Fetch balance for each token via API
      for (const [address, meta] of Object.entries(TOKEN_METADATA)) {
        try {
          const response = await fetch(
            `/api/railgun/balance?walletID=${encodeURIComponent(wallet.walletID)}&tokenAddress=${encodeURIComponent(address)}`
          );
          
          const data = await response.json();

          if (data.success) {
            const totalBalance = BigInt(data.total);
            const spendableBalance = BigInt(data.spendable);
            
            newBalances.set(address, {
              tokenAddress: address,
              symbol: meta.symbol,
              decimals: meta.decimals,
              totalBalance,
              spendableBalance,
              formattedTotal: formatUnits(totalBalance, meta.decimals),
              formattedSpendable: formatUnits(spendableBalance, meta.decimals),
            });
          } else {
            // Set zero balance on error
            newBalances.set(address, {
              tokenAddress: address,
              symbol: meta.symbol,
              decimals: meta.decimals,
              totalBalance: BigInt(0),
              spendableBalance: BigInt(0),
              formattedTotal: '0',
              formattedSpendable: '0',
            });
            console.warn(`[Balance] Failed to fetch ${meta.symbol}:`, data.error);
          }
        } catch (error) {
          // Set zero balance on fetch error
          newBalances.set(address, {
            tokenAddress: address,
            symbol: meta.symbol,
            decimals: meta.decimals,
            totalBalance: BigInt(0),
            spendableBalance: BigInt(0),
            formattedTotal: '0',
            formattedSpendable: '0',
          });
          console.warn(`[Balance] Error fetching ${meta.symbol}:`, error);
        }
      }

      setState({
        balances: newBalances,
        isLoading: false,
        error: null,
        lastUpdated: new Date(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch balances';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [wallet, walletStatus]);

  const getBalance = useCallback((tokenAddress: string): TokenBalance | undefined => {
    return state.balances.get(tokenAddress.toLowerCase());
  }, [state.balances]);

  const getUSDCBalance = useCallback((): TokenBalance | undefined => {
    return state.balances.get(TOKENS.USDC.toLowerCase());
  }, [state.balances]);

  // Auto-refresh when wallet becomes ready
  useEffect(() => {
    if (walletStatus === 'ready' && wallet) {
      refreshBalances();
    }
  }, [walletStatus, wallet?.walletID]);

  return {
    ...state,
    refreshBalances,
    getBalance,
    getUSDCBalance,
  };
}
