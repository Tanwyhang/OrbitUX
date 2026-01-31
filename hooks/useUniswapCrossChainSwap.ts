'use client';

/**
 * Uniswap X Cross-Chain Swap Hook
 * Manages cross-chain swap quotes and execution
 *
 * NOTE: This is deprecated in favor of Stargate for USDC bridging.
 * Kept for backwards compatibility with existing components.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { TokenConfig } from '@/lib/swap/unifiedConfig';
import type { CrossChainQuote, QuoteOptions } from '@/lib/swap/uniswap/uniswapTypes';
import { getCrossChainQuote, executeCrossChainSwap } from '@/lib/swap/uniswap/uniswapCrossChainService';

// ============================================================================
// Hook Return Types
// ============================================================================

interface UseCrossChainQuoteParams {
  fromToken: TokenConfig | null;
  toToken: TokenConfig | null;
  fromChainId: number;
  toChainId: number;
  inputAmount: string;
  slippage: number;
  enabled?: boolean;
}

interface UseCrossChainQuoteResult {
  quote: CrossChainQuote | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Cross-Chain Quote Hook
// ============================================================================

export function useCrossChainQuote({
  fromToken,
  toToken,
  fromChainId,
  toChainId,
  inputAmount,
  slippage,
  enabled = true,
}: UseCrossChainQuoteParams): UseCrossChainQuoteResult {
  const [quote, setQuote] = useState<CrossChainQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !enabled) {
      setQuote(null);
      setError(null);
      return;
    }

    // Skip if same chain
    if (fromChainId === toChainId) {
      setQuote(null);
      setError(new Error('Use same-chain swap for tokens on the same chain'));
      return;
    }

    // Parse input amount
    const inputAmountBigInt = BigInt(Math.floor(
      parseFloat(inputAmount || '0') * Math.pow(10, fromToken.decimals)
    ));

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
      };

      const result = await getCrossChainQuote(fromToken, toToken, inputAmountBigInt, options);

      if (!mountedRef.current) return;

      if (result) {
        setQuote(result);
        setError(null);
      } else {
        setQuote(null);
        setError(new Error('No cross-chain route available'));
      }
    } catch (err) {
      if (!mountedRef.current) return;

      setQuote(null);
      setError(err instanceof Error ? err : new Error('Failed to fetch cross-chain quote'));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fromToken, toToken, fromChainId, toChainId, inputAmount, slippage, enabled]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchQuote();
    }, 500); // Slightly longer debounce for cross-chain

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchQuote]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
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

// ============================================================================
// Cross-Chain Swap Hook
// ============================================================================

export type CrossChainSwapStep =
  | 'idle'
  | 'approving'
  | 'bridging'
  | 'confirming'
  | 'complete'
  | 'error';

export interface CrossChainSwapProgress {
  step: CrossChainSwapStep;
  message: string;
  txHash?: `0x${string}`;
  bridgeTxHash?: `0x${string}`;
  error?: Error;
}

interface UseCrossChainSwapResult {
  executeSwap: (quote: CrossChainQuote) => Promise<CrossChainSwapResult>;
  progress: CrossChainSwapProgress;
  isSwapping: boolean;
  reset: () => void;
}

const STEP_MESSAGES: Record<CrossChainSwapStep, string> = {
  idle: 'Ready to swap',
  approving: 'Approving tokens...',
  bridging: 'Bridging tokens across chains...',
  confirming: 'Confirming on destination chain...',
  complete: 'Cross-chain swap complete!',
  error: 'Cross-chain swap failed',
};

export interface CrossChainSwapResult {
  success: boolean;
  txHash?: `0x${string}`;
  bridgeTxHash?: `0x${string}`;
  outputAmount?: bigint;
  error?: string;
}

export function useCrossChainSwap(): UseCrossChainSwapResult {
  const { address } = useAccount();
  const chainId = useChainId();

  // Import viem clients
  const { useWalletClient, usePublicClient } = require('wagmi');
  const { data: walletClientData } = useWalletClient();
  const publicClient = usePublicClient();

  const [progress, setProgress] = useState<CrossChainSwapProgress>({
    step: 'idle',
    message: STEP_MESSAGES.idle,
  });
  const [isSwapping, setIsSwapping] = useState(false);

  const updateProgress = useCallback(
    (step: CrossChainSwapStep, txHash?: `0x${string}`, error?: Error) => {
      setProgress({
        step,
        message: STEP_MESSAGES[step],
        txHash,
        error,
      });
    },
    []
  );

  const reset = useCallback(() => {
    setProgress({
      step: 'idle',
      message: STEP_MESSAGES.idle,
    });
    setIsSwapping(false);
  }, []);

  const executeSwap = useCallback(
    async (quote: CrossChainQuote): Promise<CrossChainSwapResult> => {
      if (!address || !walletClientData || !publicClient) {
        return {
          success: false,
          error: 'Wallet not connected',
        };
      }

      setIsSwapping(true);

      try {
        updateProgress('approving');

        // Execute the cross-chain swap
        const result = await executeCrossChainSwap(
          {
            quote,
            recipient: address,
          },
          walletClientData,
          publicClient
        );

        if (result.success) {
          updateProgress('complete', result.txHash);
        } else {
          updateProgress('error', undefined, new Error(result.error || 'Cross-chain swap failed'));
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Cross-chain swap failed');
        updateProgress('error', undefined, err);

        return {
          success: false,
          error: err.message,
        };
      } finally {
        setIsSwapping(false);
      }
    },
    [address, walletClientData, publicClient, updateProgress]
  );

  return {
    executeSwap,
    progress,
    isSwapping,
    reset,
  };
}

// ============================================================================
// Helper: Format Duration
// ============================================================================

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}
