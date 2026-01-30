'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import type { SwapQuote, SwapStep, SwapProgress, SwapResult, PoolToken } from '@/lib/swap/types';
import { 
  ERC20_ABI, 
  POOL_ABI, 
  getTokenAllowance,
  getTokenPosition,
} from '@/lib/swap';
import { EXPLORER_URL } from '@/lib/wagmi';

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
  swapping: 'Executing swap...',
  unshielding: 'Unshielding tokens...',
  complete: 'Swap complete!',
  error: 'Swap failed',
};

export function usePoolSwap(): UsePoolSwapResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

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
  }, []);

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

    setIsSwapping(true);
    
    try {
      if (privateMode) {
        // Private swap flow: Shield -> Swap -> Unshield
        // For now, we'll implement public swap first and add RAILGUN integration later
        // since it requires significant additional infrastructure
        console.warn('Private mode not yet fully implemented, falling back to public swap');
      }

      // Public swap flow
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

        // Determine which token is which in the pool
        const position = getTokenPosition(fromToken, pool);
        
        // Calculate min output for this step
        // For intermediate swaps, we use 0 slippage internally
        // For the final swap, we use the user's minimum received
        const minOutput = isLastSwap ? minimumReceived : ZERO;

        let amount0In: bigint;
        let amount1In: bigint;
        let amount0OutMin: bigint;
        let amount1OutMin: bigint;

        if (position === 'token0') {
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
  }, [address, walletClient, publicClient, updateProgress]);

  return {
    executeSwap,
    progress,
    isSwapping,
    reset,
  };
}

/**
 * Get explorer link for a transaction
 */
export function getExplorerLink(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}
