'use client';

/**
 * Uniswap v3 Swap Hook
 * Manages Uniswap v3 swap execution
 */

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import type { UniswapQuote, UniswapSwapResult } from '@/lib/swap/uniswap/uniswapTypes';
import { executeUniswapSwap } from '@/lib/swap/uniswap/uniswapSwapService';

// ============================================================================
// Swap Step Type
// ============================================================================

export type UniswapSwapStep =
  | 'idle'
  | 'approving'
  | 'swapping'
  | 'complete'
  | 'error';

// ============================================================================
// Swap Progress
// ============================================================================

export interface UniswapSwapProgress {
  step: UniswapSwapStep;
  message: string;
  txHash?: `0x${string}`;
  error?: Error;
}

// ============================================================================
// Step Messages
// ============================================================================

const STEP_MESSAGES: Record<UniswapSwapStep, string> = {
  idle: 'Ready to swap',
  approving: 'Approving token...',
  swapping: 'Executing swap...',
  complete: 'Swap complete!',
  error: 'Swap failed',
};

// ============================================================================
// Hook Return Type
// ============================================================================

interface UseUniswapSwapResult {
  executeSwap: (quote: UniswapQuote) => Promise<UniswapSwapResult>;
  progress: UniswapSwapProgress;
  isSwapping: boolean;
  reset: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useUniswapSwap(): UseUniswapSwapResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [progress, setProgress] = useState<UniswapSwapProgress>({
    step: 'idle',
    message: STEP_MESSAGES.idle,
  });
  const [isSwapping, setIsSwapping] = useState(false);

  const updateProgress = useCallback(
    (step: UniswapSwapStep, txHash?: `0x${string}`, error?: Error) => {
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
    async (quote: UniswapQuote): Promise<UniswapSwapResult> => {
      if (!address || !walletClient || !publicClient) {
        return {
          success: false,
          error: 'Wallet not connected',
        };
      }

      setIsSwapping(true);

      try {
        const result = await executeUniswapSwap(
          {
            quote,
            recipient: address,
          },
          walletClient,
          publicClient
        );

        if (result.success) {
          updateProgress('complete', result.txHash);
        } else {
          updateProgress('error', undefined, new Error(result.error || 'Swap failed'));
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Swap failed');
        updateProgress('error', undefined, err);

        return {
          success: false,
          error: err.message,
        };
      } finally {
        setIsSwapping(false);
      }
    },
    [address, walletClient, publicClient, updateProgress]
  );

  return {
    executeSwap,
    progress,
    isSwapping,
    reset,
  };
}

// ============================================================================
// Helper: Get Explorer Link
// ============================================================================

export function getExplorerLink(txHash: string, chainId: number): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
    42161: 'https://arbiscan.io',
    137: 'https://polygonscan.com',
  };

  const baseUrl = explorers[chainId] || 'https://etherscan.io';
  return `${baseUrl}/tx/${txHash}`;
}
