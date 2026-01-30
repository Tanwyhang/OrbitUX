'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import type { PoolToken } from '@/lib/swap/types';
import type {
  ChainId,
  CrossChainQuote,
  CrossChainStep,
  CrossChainProgress,
  CrossChainResult,
  CrossChainSwapQuote,
  CrossChainTransferQuote,
  CrossChainCrossSwapQuote,
} from '@/lib/swap/crossChainTypes';
import {
  getSwapQuote,
  getTransferQuote,
  getCrossChainSwapQuote,
  getTokenAllowance,
  CROSS_CHAIN_TOKENS,
  CHAIN_IDS,
} from '@/lib/swap/crossChainPoolService';
import { CROSS_CHAIN_POOL_ABI } from '@/lib/swap/crossChainConfig';
import { ERC20_ABI } from '@/lib/swap/config';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

const STEP_MESSAGES: Record<CrossChainStep, string> = {
  idle: 'Ready',
  checking_allowance: 'Checking token allowance...',
  approving: 'Approving token...',
  executing_swap: 'Executing swap...',
  executing_transfer: 'Initiating cross-chain transfer...',
  executing_cross_chain_swap: 'Executing cross-chain swap...',
  waiting_confirmation: 'Waiting for confirmation...',
  waiting_relay: 'Waiting for cross-chain relay...',
  complete: 'Complete!',
  error: 'Failed',
};

// ═══════════════════════════════════════════════════════════════
// HOOK INTERFACE
// ═══════════════════════════════════════════════════════════════

interface UseCrossChainSwapResult {
  // Quote functions
  getQuote: (
    tokenIn: PoolToken,
    tokenOut: PoolToken,
    amountIn: bigint,
    destChainId?: ChainId,
    slippage?: number
  ) => Promise<CrossChainQuote | null>;
  
  // Execution functions
  executeSwap: (quote: CrossChainSwapQuote) => Promise<CrossChainResult>;
  executeTransfer: (
    quote: CrossChainTransferQuote,
    recipient: `0x${string}`
  ) => Promise<CrossChainResult>;
  executeCrossChainSwap: (
    quote: CrossChainCrossSwapQuote,
    recipient: `0x${string}`
  ) => Promise<CrossChainResult>;
  
  // State
  progress: CrossChainProgress;
  isExecuting: boolean;
  reset: () => void;
  
  // Config
  tokens: typeof CROSS_CHAIN_TOKENS;
  chainIds: typeof CHAIN_IDS;
}

// ═══════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════

export function useCrossChainSwap(): UseCrossChainSwapResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [progress, setProgress] = useState<CrossChainProgress>({
    step: 'idle',
    message: STEP_MESSAGES.idle,
  });
  const [isExecuting, setIsExecuting] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // Progress helpers
  // ─────────────────────────────────────────────────────────────

  const updateProgress = useCallback(
    (
      step: CrossChainStep,
      sourceTxHash?: `0x${string}`,
      destTxHash?: `0x${string}`,
      error?: Error
    ) => {
      setProgress({
        step,
        message: STEP_MESSAGES[step],
        sourceTxHash,
        destTxHash,
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
    setIsExecuting(false);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Quote function
  // ─────────────────────────────────────────────────────────────

  const getQuote = useCallback(
    async (
      tokenIn: PoolToken,
      tokenOut: PoolToken,
      amountIn: bigint,
      destChainId?: ChainId,
      slippage: number = 0.5
    ): Promise<CrossChainQuote | null> => {
      if (amountIn === BigInt(0)) return null;

      // If no destination chain, it's a same-chain swap
      if (!destChainId || destChainId === CHAIN_IDS.SEPOLIA) {
        return getSwapQuote(tokenIn, tokenOut, amountIn, slippage);
      }

      // If same token, it's a cross-chain transfer
      if (tokenIn.symbol === tokenOut.symbol) {
        return getTransferQuote(tokenIn, amountIn, destChainId);
      }

      // Otherwise, it's a cross-chain swap
      return getCrossChainSwapQuote(
        tokenIn,
        tokenOut,
        amountIn,
        destChainId,
        slippage
      );
    },
    []
  );

  // ─────────────────────────────────────────────────────────────
  // Same-chain swap execution
  // ─────────────────────────────────────────────────────────────

  const executeSwap = useCallback(
    async (quote: CrossChainSwapQuote): Promise<CrossChainResult> => {
      if (!address || !walletClient || !publicClient) {
        return {
          success: false,
          error: new Error('Wallet not connected'),
        };
      }

      setIsExecuting(true);

      try {
        const { pool, tokenIn, amountIn, minAmountOut } = quote;

        // Check and approve token
        updateProgress('checking_allowance');
        const currentAllowance = await getTokenAllowance(
          tokenIn.address,
          address,
          pool.address
        );

        if (currentAllowance < amountIn) {
          updateProgress('approving');
          const approveHash = await walletClient.writeContract({
            address: tokenIn.address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [pool.address, MAX_UINT256],
            gas: BigInt(100000),
          });

          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        // Determine token positions
        updateProgress('executing_swap');
        const token0Address = (await publicClient.readContract({
          address: pool.address,
          abi: CROSS_CHAIN_POOL_ABI,
          functionName: 'token0',
        })) as `0x${string}`;

        const isToken0 =
          tokenIn.address.toLowerCase() === token0Address.toLowerCase();

        const amount0In = isToken0 ? amountIn : BigInt(0);
        const amount1In = isToken0 ? BigInt(0) : amountIn;
        const amount0OutMin = isToken0 ? BigInt(0) : minAmountOut;
        const amount1OutMin = isToken0 ? minAmountOut : BigInt(0);

        const swapHash = await walletClient.writeContract({
          address: pool.address,
          abi: CROSS_CHAIN_POOL_ABI,
          functionName: 'swap',
          args: [amount0In, amount1In, amount0OutMin, amount1OutMin, address],
          gas: BigInt(300000),
        });

        updateProgress('waiting_confirmation', swapHash);
        await publicClient.waitForTransactionReceipt({ hash: swapHash });

        updateProgress('complete', swapHash);

        return {
          success: true,
          sourceTxHash: swapHash,
          outputAmount: quote.amountOut,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Swap failed');
        updateProgress('error', undefined, undefined, err);
        return {
          success: false,
          error: err,
        };
      } finally {
        setIsExecuting(false);
      }
    },
    [address, walletClient, publicClient, updateProgress]
  );

  // ─────────────────────────────────────────────────────────────
  // Cross-chain transfer execution
  // ─────────────────────────────────────────────────────────────

  const executeTransfer = useCallback(
    async (
      quote: CrossChainTransferQuote,
      recipient: `0x${string}`
    ): Promise<CrossChainResult> => {
      if (!address || !walletClient || !publicClient) {
        return {
          success: false,
          error: new Error('Wallet not connected'),
        };
      }

      setIsExecuting(true);

      try {
        const { pool, token, amountIn, destChainId } = quote;

        // Check and approve token
        updateProgress('checking_allowance');
        const currentAllowance = await getTokenAllowance(
          token.address,
          address,
          pool.address
        );

        if (currentAllowance < amountIn) {
          updateProgress('approving');
          const approveHash = await walletClient.writeContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [pool.address, MAX_UINT256],
            gas: BigInt(100000),
          });

          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        // Determine if token is token0 or token1
        updateProgress('executing_transfer');
        const token0Address = (await publicClient.readContract({
          address: pool.address,
          abi: CROSS_CHAIN_POOL_ABI,
          functionName: 'token0',
        })) as `0x${string}`;

        const isToken0 =
          token.address.toLowerCase() === token0Address.toLowerCase();

        const amount0 = isToken0 ? amountIn : BigInt(0);
        const amount1 = isToken0 ? BigInt(0) : amountIn;

        const transferHash = await walletClient.writeContract({
          address: pool.address,
          abi: CROSS_CHAIN_POOL_ABI,
          functionName: 'crossChainTransfer',
          args: [BigInt(destChainId), recipient, amount0, amount1],
          gas: BigInt(500000),
        });

        updateProgress('waiting_confirmation', transferHash);
        await publicClient.waitForTransactionReceipt({ hash: transferHash });

        updateProgress('waiting_relay', transferHash);
        // Note: In production, you would monitor for the relay event on destination chain

        updateProgress('complete', transferHash);

        return {
          success: true,
          sourceTxHash: transferHash,
          outputAmount: quote.amountOut,
        };
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error('Transfer failed');
        updateProgress('error', undefined, undefined, err);
        return {
          success: false,
          error: err,
        };
      } finally {
        setIsExecuting(false);
      }
    },
    [address, walletClient, publicClient, updateProgress]
  );

  // ─────────────────────────────────────────────────────────────
  // Cross-chain swap execution
  // ─────────────────────────────────────────────────────────────

  const executeCrossChainSwap = useCallback(
    async (
      quote: CrossChainCrossSwapQuote,
      recipient: `0x${string}`
    ): Promise<CrossChainResult> => {
      if (!address || !walletClient || !publicClient) {
        return {
          success: false,
          error: new Error('Wallet not connected'),
        };
      }

      setIsExecuting(true);

      try {
        const { pool, tokenIn, amountIn, minAmountOut, destChainId } = quote;

        // Check and approve token
        updateProgress('checking_allowance');
        const currentAllowance = await getTokenAllowance(
          tokenIn.address,
          address,
          pool.address
        );

        if (currentAllowance < amountIn) {
          updateProgress('approving');
          const approveHash = await walletClient.writeContract({
            address: tokenIn.address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [pool.address, MAX_UINT256],
            gas: BigInt(100000),
          });

          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        // Execute cross-chain swap
        updateProgress('executing_cross_chain_swap');

        const swapHash = await walletClient.writeContract({
          address: pool.address,
          abi: CROSS_CHAIN_POOL_ABI,
          functionName: 'crossChainSwap',
          args: [BigInt(destChainId), amountIn, minAmountOut],
          gas: BigInt(600000),
        });

        updateProgress('waiting_confirmation', swapHash);
        await publicClient.waitForTransactionReceipt({ hash: swapHash });

        updateProgress('waiting_relay', swapHash);
        // Note: In production, monitor for relay event

        updateProgress('complete', swapHash);

        return {
          success: true,
          sourceTxHash: swapHash,
          outputAmount: quote.amountOut,
        };
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error('Cross-chain swap failed');
        updateProgress('error', undefined, undefined, err);
        return {
          success: false,
          error: err,
        };
      } finally {
        setIsExecuting(false);
      }
    },
    [address, walletClient, publicClient, updateProgress]
  );

  // ─────────────────────────────────────────────────────────────
  // Return hook interface
  // ─────────────────────────────────────────────────────────────

  return {
    getQuote,
    executeSwap,
    executeTransfer,
    executeCrossChainSwap,
    progress,
    isExecuting,
    reset,
    tokens: CROSS_CHAIN_TOKENS,
    chainIds: CHAIN_IDS,
  };
}
