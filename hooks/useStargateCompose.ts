'use client';

/**
 * Stargate Compose Hook
 * Manages automated Bridge + Swap (USDT → ETH across chains)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import type { SupportedChainId } from '@/lib/swap/unifiedConfig';
import type { ComposeBridgeSwapQuote } from '@/lib/swap/stargate/stargateComposeService';
import { getComposeQuote, executeComposeBridgeSwap } from '@/lib/swap/stargate/stargateComposeService';

// ============================================================================
// Types
// ============================================================================

interface UseComposeQuoteParams {
  fromChainId: number;
  toChainId: number;
  inputAmount: string;
  slippage: number;
  estimatedEthPrice?: number; // ETH per USDT on destination
  enabled?: boolean;
}

interface UseComposeQuoteResult {
  quote: ComposeBridgeSwapQuote | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Quote Hook
// ============================================================================

export function useComposeQuote({
  fromChainId,
  toChainId,
  inputAmount,
  slippage,
  estimatedEthPrice = 0.0003, // Default: ~0.0003 ETH per USDT
  enabled = true,
}: UseComposeQuoteParams): UseComposeQuoteResult {
  const [quote, setQuote] = useState<ComposeBridgeSwapQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchQuote = useCallback(async () => {
    if (!enabled) {
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

    // Get USDT config for source chain
    const { getUSDTConfig } = await import('@/lib/swap/unifiedConfig');
    const usdtConfig = getUSDTConfig(fromChainId as SupportedChainId);

    // Parse input amount
    const inputAmountBigInt = BigInt(Math.floor(
      parseFloat(inputAmount || '0') * Math.pow(10, usdtConfig.decimals)
    ));

    if (inputAmountBigInt <= BigInt(0)) {
      setQuote(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getComposeQuote(
        fromChainId as SupportedChainId,
        toChainId as SupportedChainId,
        inputAmountBigInt,
        slippage,
        estimatedEthPrice
      );

      if (!mountedRef.current) return;

      if (result) {
        setQuote(result);
        setError(null);
      } else {
        setQuote(null);
        setError(new Error('No compose route available'));
      }
    } catch (err) {
      if (!mountedRef.current) return;

      setQuote(null);
      setError(err instanceof Error ? err : new Error('Failed to fetch compose quote'));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fromChainId, toChainId, inputAmount, slippage, estimatedEthPrice, enabled]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchQuote();
    }, 500);

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
// Execution Hook
// ============================================================================

export type ComposeStep =
  | 'idle'
  | 'approving'
  | 'composing'
  | 'bridging'
  | 'swapping'
  | 'complete'
  | 'error';

export interface ComposeProgress {
  step: ComposeStep;
  message: string;
  txHash?: `0x${string}`;
  error?: Error;
}

export interface ComposeResult {
  success: boolean;
  txHash?: `0x${string}`;
  outputAmount?: bigint;
  error?: string;
}

interface UseComposeSwapResult {
  executeCompose: (quote: ComposeBridgeSwapQuote) => Promise<ComposeResult>;
  progress: ComposeProgress;
  isComposing: boolean;
  reset: () => void;
}

const STEP_MESSAGES: Record<ComposeStep, string> = {
  idle: 'Ready to bridge & swap',
  approving: 'Approving USDT...',
  composing: 'Preparing compose transaction...',
  bridging: 'Bridging USDT across chains...',
  swapping: 'Swapping to ETH on destination...',
  complete: 'Bridge & swap complete!',
  error: 'Bridge & swap failed',
};

export function useStargateCompose(): UseComposeSwapResult {
  const { address } = useAccount();

  const { useWalletClient, usePublicClient } = require('wagmi');
  const { data: walletClientData } = useWalletClient();
  const publicClient = usePublicClient();

  const [progress, setProgress] = useState<ComposeProgress>({
    step: 'idle',
    message: STEP_MESSAGES.idle,
  });
  const [isComposing, setIsComposing] = useState(false);

  const updateProgress = useCallback(
    (step: ComposeStep, txHash?: `0x${string}`, error?: Error) => {
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
    setIsComposing(false);
  }, []);

  const executeComposeInternal = useCallback(
    async (quote: ComposeBridgeSwapQuote): Promise<ComposeResult> => {
      if (!address || !walletClientData || !publicClient) {
        return {
          success: false,
          error: 'Wallet not connected',
        };
      }

      setIsComposing(true);

      try {
        updateProgress('approving');

        // Default to 3000 fee tier (0.3%) for destination swap
        const params = {
          quote,
          recipient: address,
          destinationSwap: {
            uniRouterAddress: quote.destinationRouterAddress,
            feeTier: 3000, // 0.3% pool
            minEthOutput: quote.expectedSwapOutput / BigInt(100), // 1% minimum
          },
          dstGasForCall: BigInt(200000), // Extra gas for destination swap
        };

        const result = await executeComposeBridgeSwap(
          params,
          walletClientData,
          publicClient
        );

        if (result.success) {
          updateProgress('complete', result.txHash);
        } else {
          updateProgress('error', undefined, new Error(result.error || 'Compose failed'));
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Compose failed');
        updateProgress('error', undefined, err);

        return {
          success: false,
          error: err.message,
        };
      } finally {
        setIsComposing(false);
      }
    },
    [address, walletClientData, publicClient, updateProgress]
  );

  return {
    executeCompose: executeComposeInternal,
    progress,
    isComposing,
    reset,
  };
}

// ============================================================================
// Helper: Format Duration
// ============================================================================

export function formatComposeDuration(seconds: number): string {
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
