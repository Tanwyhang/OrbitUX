'use client';

/**
 * Stargate Bridge Hook (Fixed)
 * Manages USDT bridging between Arbitrum and Polygon
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import type { TokenConfig } from '@/lib/swap/unifiedConfig';
import type { StargateQuote } from '@/lib/swap/stargate/stargateTypes';
import { getBridgeQuote, executeBridge, calculateMinOutput } from '@/lib/swap/stargate/stargateBridgeService';
import { getUSDTConfig } from '@/lib/swap/unifiedConfig';

// ============================================================================
// Hook Return Types
// ============================================================================

interface UseStargateQuoteParams {
  fromChainId: number;
  toChainId: number;
  inputAmount: string;
  slippage: number;
  enabled?: boolean;
}

interface UseStargateQuoteResult {
  quote: StargateQuote | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Bridge Quote Hook
// ============================================================================

export function useStargateQuote({
  fromChainId,
  toChainId,
  inputAmount,
  slippage,
  enabled = true,
}: UseStargateQuoteParams): UseStargateQuoteResult {
  const [quote, setQuote] = useState<StargateQuote | null>(null);
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
    const usdtConfig = getUSDTConfig(fromChainId as any);

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
      const result = await getBridgeQuote(
        fromChainId as any,
        toChainId as any,
        inputAmountBigInt,
        slippage
      );

      if (!mountedRef.current) return;

      if (result) {
        setQuote(result);
        setError(null);
      } else {
        setQuote(null);
        setError(new Error('No bridge route available'));
      }
    } catch (err) {
      if (!mountedRef.current) return;

      setQuote(null);
      setError(err instanceof Error ? err : new Error('Failed to fetch bridge quote'));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fromChainId, toChainId, inputAmount, slippage, enabled]);

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
// Bridge Execution Hook
// ============================================================================

export type StargateBridgeStep =
  | 'idle'
  | 'approving'
  | 'bridging'
  | 'complete'
  | 'error';

export interface StargateBridgeProgress {
  step: StargateBridgeStep;
  message: string;
  txHash?: `0x${string}`;
  error?: Error;
}

export interface StargateBridgeResult {
  success: boolean;
  txHash?: `0x${string}`;
  outputAmount?: bigint;
  error?: string;
}

interface UseStargateBridgeResult {
  executeBridge: (quote: StargateQuote) => Promise<StargateBridgeResult>;
  progress: StargateBridgeProgress;
  isBridging: boolean;
  reset: () => void;
}

const STEP_MESSAGES: Record<StargateBridgeStep, string> = {
  idle: 'Ready to bridge',
  approving: 'Approving USDT...',
  bridging: 'Bridging USDT across chains...',
  complete: 'Bridge complete!',
  error: 'Bridge failed',
};

export function useStargateBridge(): UseStargateBridgeResult {
  const { address } = useAccount();

  const { useWalletClient, usePublicClient } = require('wagmi');
  const { data: walletClientData } = useWalletClient();
  const publicClient = usePublicClient();

  const [progress, setProgress] = useState<StargateBridgeProgress>({
    step: 'idle',
    message: STEP_MESSAGES.idle,
  });
  const [isBridging, setIsBridging] = useState(false);

  const updateProgress = useCallback(
    (step: StargateBridgeStep, txHash?: `0x${string}`, error?: Error) => {
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
    setIsBridging(false);
  }, []);

  const executeBridgeInternal = useCallback(
    async (quote: StargateQuote): Promise<StargateBridgeResult> => {
      if (!address || !walletClientData || !publicClient) {
        return {
          success: false,
          error: 'Wallet not connected',
        };
      }

      setIsBridging(true);

      try {
        updateProgress('approving');

        const result = await executeBridge(
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
          updateProgress('error', undefined, new Error(result.error || 'Bridge failed'));
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Bridge failed');
        updateProgress('error', undefined, err);

        return {
          success: false,
          error: err.message,
        };
      } finally {
        setIsBridging(false);
      }
    },
    [address, walletClientData, publicClient, updateProgress]
  );

  return {
    executeBridge: executeBridgeInternal,
    progress,
    isBridging,
    reset,
  };
}

// ============================================================================
// Helper: Format Duration
// ============================================================================

export function formatBridgeDuration(seconds: number): string {
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
