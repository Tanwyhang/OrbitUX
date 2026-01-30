'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import type { SwapQuote, SwapStep, SwapProgress, SwapResult } from '@/lib/swap/types';
import { 
  ERC20_ABI, 
  POOL_ABI, 
  getTokenAllowance,
} from '@/lib/swap';
import { EXPLORER_URL } from '@/lib/wagmi';
import { usePrivateSwap } from './usePrivateSwap';
import type { PrivateSwapStep } from '@/lib/swap/privateSwapTypes';

// BigInt constants
const ZERO = BigInt(0);
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

interface UsePoolSwapResult {
  executeSwap: (quote: SwapQuote, privateMode: boolean) => Promise<SwapResult>;
  progress: SwapProgress;
  isSwapping: boolean;
  reset: () => void;
}

const STEP_MESSAGES: Record<SwapStep, string> = {
  idle: 'Ready to swap',
  approving: 'Approving token...',
  shielding: 'Shielding tokens via RAILGUN...',
  waiting_poi: 'Verifying privacy...',
  generating_proof: 'Generating ZK proof...',
  swapping: 'Executing swap...',
  unshielding: 'Unshielding tokens...',
  complete: 'Swap complete!',
  error: 'Swap failed',
};

/**
 * Map private swap step to regular swap step for UI consistency
 */
function mapPrivateStepToSwapStep(privateStep: PrivateSwapStep): SwapStep {
  const mapping: Record<PrivateSwapStep, SwapStep> = {
    preparing: 'approving',
    approving: 'approving',
    shielding_input: 'shielding',
    waiting_poi_input: 'waiting_poi',
    generating_proof_input: 'generating_proof',
    unshielding_to_relayer: 'swapping',
    executing_swap: 'swapping',
    shielding_output: 'shielding',
    waiting_poi_output: 'waiting_poi',
    generating_proof_output: 'generating_proof',
    unshielding_output: 'unshielding',
    complete: 'complete',
    error: 'error',
  };
  return mapping[privateStep] || 'swapping';
}

export function usePoolSwap(): UsePoolSwapResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  
  // Private swap hook
  const { 
    executePrivateSwap, 
    progress: privateProgress, 
    isSwapping: isPrivateSwapping,
    reset: resetPrivate,
  } = usePrivateSwap();

  const [progress, setProgress] = useState<SwapProgress>({
    step: 'idle',
    message: STEP_MESSAGES.idle,
  });
  const [isSwapping, setIsSwapping] = useState(false);

  const updateProgress = useCallback((step: SwapStep, txHash?: `0x${string}`, error?: Error) => {
    setProgress({
      step,
      message: STEP_MESSAGES[step],
      txHash,
      error,
    });
  }, []);

  const reset = useCallback(() => {
    setProgress({
      step: 'idle',
      message: STEP_MESSAGES.idle,
    });
    setIsSwapping(false);
    resetPrivate();
  }, [resetPrivate]);

  const executeSwap = useCallback(async (
    quote: SwapQuote,
    privateMode: boolean
  ): Promise<SwapResult> => {
    if (!address || !walletClient || !publicClient) {
      return {
        success: false,
        error: new Error('Wallet not connected'),
      };
    }

    // Use private swap flow when privateMode is enabled
    if (privateMode) {
      console.log('[usePoolSwap] Executing private swap via RAILGUN...');
      
      const result = await executePrivateSwap(quote);
      
      if (result.success) {
        // Update progress to complete with swap tx hash
        setProgress({
          step: 'complete',
          message: 'Private swap complete!',
          txHash: result.swapTxHash as `0x${string}` | undefined,
          inputShieldTxHash: result.inputShieldTxHash,
          swapTxHash: result.swapTxHash,
        });
        
        return {
          success: true,
          txHash: result.swapTxHash as `0x${string}` | undefined,
          outputAmount: quote.outputAmount,
        };
      } else {
        const err = new Error(result.error || 'Private swap failed');
        setProgress({
          step: 'error',
          message: result.error || 'Private swap failed',
          error: err,
        });
        
        return {
          success: false,
          error: err,
        };
      }
    }

    // Public swap flow
    setIsSwapping(true);
    
    try {
      const { route, inputAmount, minimumReceived } = quote;
      
      // For each pool in the route, execute the swap
      let currentAmount = inputAmount;
      let lastTxHash: `0x${string}` | undefined;

      for (let i = 0; i < route.pools.length; i++) {
        const pool = route.pools[i];
        const fromToken = route.path[i];
        const toToken = route.path[i + 1];
        const isLastSwap = i === route.pools.length - 1;

        // Step 1: Check and approve token
        updateProgress('approving');

        const currentAllowance = await getTokenAllowance(
          fromToken.address,
          address,
          pool.address
        );

        if (currentAllowance < currentAmount) {
          // Need to approve
          const approveHash = await walletClient.writeContract({
            address: fromToken.address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [pool.address, MAX_UINT256],
            gas: BigInt(100000), // Explicit gas limit for approval
          });

          // Wait for approval confirmation
          await publicClient.waitForTransactionReceipt({
            hash: approveHash,
          });
        }

        // Step 2: Execute swap
        updateProgress('swapping');

        // Read actual token0 from the pool contract to determine position
        const token0Address = await publicClient.readContract({
          address: pool.address,
          abi: POOL_ABI,
          functionName: 'token0',
        }) as `0x${string}`;
        
        const isToken0 = fromToken.address.toLowerCase() === token0Address.toLowerCase();
        
        // Calculate min output for this step
        // For intermediate swaps, we use 0 slippage internally
        // For the final swap, we use the user's minimum received
        const minOutput = isLastSwap ? minimumReceived : ZERO;

        let amount0In: bigint;
        let amount1In: bigint;
        let amount0OutMin: bigint;
        let amount1OutMin: bigint;

        if (isToken0) {
          // Swapping token0 for token1
          amount0In = currentAmount;
          amount1In = ZERO;
          amount0OutMin = ZERO;
          amount1OutMin = minOutput;
        } else {
          // Swapping token1 for token0
          amount0In = ZERO;
          amount1In = currentAmount;
          amount0OutMin = minOutput;
          amount1OutMin = ZERO;
        }

        const swapHash = await walletClient.writeContract({
          address: pool.address,
          abi: POOL_ABI,
          functionName: 'swap',
          args: [amount0In, amount1In, amount0OutMin, amount1OutMin, address],
          gas: BigInt(300000), // Explicit gas limit for swap
        });

        // Wait for swap confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: swapHash,
        });

        lastTxHash = swapHash;

        // For multi-hop, get the output amount from the transaction
        // In a real implementation, we'd parse the logs to get the exact output
        // For now, we'll use the quote's calculated output
        if (!isLastSwap) {
          // For intermediate swaps, use calculated output as next input
          // This is a simplification - in production, parse the actual output from logs
          currentAmount = quote.outputAmount; // Simplified
        }
      }

      updateProgress('complete', lastTxHash);

      return {
        success: true,
        txHash: lastTxHash,
        outputAmount: quote.outputAmount,
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error('Swap failed');
      updateProgress('error', undefined, err);
      
      return {
        success: false,
        error: err,
      };
    } finally {
      setIsSwapping(false);
    }
  }, [address, walletClient, publicClient, updateProgress, executePrivateSwap]);

  // Combine progress: use private progress when available, otherwise use local progress
  const combinedProgress: SwapProgress = isPrivateSwapping && privateProgress
    ? {
        step: mapPrivateStepToSwapStep(privateProgress.step),
        message: privateProgress.message,
        inputShieldTxHash: privateProgress.inputShieldTxHash,
        swapTxHash: privateProgress.swapTxHash,
      }
    : progress;

  return {
    executeSwap,
    progress: combinedProgress,
    isSwapping: isSwapping || isPrivateSwapping,
    reset,
  };
}

/**
 * Get explorer link for a transaction
 */
export function getExplorerLink(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}
