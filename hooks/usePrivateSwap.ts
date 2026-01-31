'use client';

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import type { Address, Hex } from 'viem';
import { useRailgunWallet } from './useRailgunWallet';
import { RELAYER_ADDRESS } from '@/lib/wagmi';
import type { UniswapQuote } from '@/lib/swap/uniswap/uniswapTypes';
import type {
  PrivateSwapProgress,
  PrivateSwapResult,
  PrivateSwapRequest,
  PrivateSwapStep,
} from '@/lib/swap/privateSwapTypes';
import { PRIVATE_SWAP_MESSAGES } from '@/lib/swap/privateSwapTypes';
import type { PermitData } from '@/lib/railgun/types';

// EIP-2612 Permit types
const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// Nonces ABI for permit
const NONCES_ABI = [
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface UsePrivateSwapResult {
  executePrivateSwap: (quote: UniswapQuote) => Promise<PrivateSwapResult>;
  progress: PrivateSwapProgress | null;
  isSwapping: boolean;
  reset: () => void;
}

/**
 * Hook for executing private swaps via RAILGUN
 *
 * Now uses Uniswap quotes and executes via the standardized DEX adapter system
 *
 * Flow:
 * 1. Sign gasless permit for input token
 * 2. Call /api/swap/private which streams progress via SSE
 * 3. The API uses the standardized private swap service with Uniswap adapter
 * 4. Return result with all TX hashes
 */
export function usePrivateSwap(): UsePrivateSwapResult {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { wallet } = useRailgunWallet();

  const [progress, setProgress] = useState<PrivateSwapProgress | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const reset = useCallback(() => {
    setProgress(null);
    setIsSwapping(false);
  }, []);

  /**
   * Get permit domain for a token
   */
  const getTokenDomain = useCallback((tokenAddress: string, chainId: number) => {
    return {
      name: 'USDC', // Default - should be dynamic based on token
      version: '2',
      chainId: chainId,
      verifyingContract: tokenAddress as Address,
    };
  }, []);

  /**
   * Sign an EIP-2612 permit for gasless approval
   */
  const signPermit = useCallback(async (
    tokenAddress: string,
    amount: bigint,
    deadline: bigint,
    chainId: number
  ): Promise<PermitData> => {
    if (!walletClient || !address || !publicClient) {
      throw new Error('Wallet not connected');
    }

    // Get current nonce
    const nonce = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [address],
    });

    const domain = getTokenDomain(tokenAddress, chainId);

    const message = {
      owner: address,
      spender: RELAYER_ADDRESS,
      value: amount,
      nonce,
      deadline,
    };

    // Sign with wallet
    const signature = await walletClient.signTypedData({
      account: address,
      domain,
      types: PERMIT_TYPES,
      primaryType: 'Permit',
      message,
    });

    // Parse signature
    const r = `0x${signature.slice(2, 66)}` as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return {
      owner: address,
      spender: RELAYER_ADDRESS,
      value: amount.toString(),
      deadline: deadline.toString(),
      v,
      r,
      s,
    };
  }, [walletClient, address, publicClient, getTokenDomain]);

  /**
   * Execute a private swap using Uniswap quote
   *
   * The quote contains Uniswap route information which will be used
   * by the standardized private swap service with the Uniswap DEX adapter
   */
  const executePrivateSwap = useCallback(async (
    quote: UniswapQuote
  ): Promise<PrivateSwapResult> => {
    if (!address || !walletClient || !wallet) {
      return {
        success: false,
        error: 'Wallet not connected or RAILGUN wallet not initialized',
      };
    }

    setIsSwapping(true);
    setProgress({
      step: 'preparing',
      progress: 0,
      message: PRIVATE_SWAP_MESSAGES.preparing,
    });

    try {
      const inputToken = quote.inputToken;
      const outputToken = quote.outputToken;

      // Step 1: Sign permit for input token
      setProgress({
        step: 'approving',
        progress: 5,
        message: 'Please sign the approval in your wallet...',
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
      const permitData = await signPermit(
        inputToken.address,
        quote.inputAmount,
        deadline,
        chainId
      );

      // Step 2: Prepare request with Uniswap-specific data
      const request: PrivateSwapRequest & {
        uniswapData: {
          fee: number;
          poolAddress?: string;
        };
      } = {
        senderWalletID: wallet.walletID,
        senderEncryptionKey: wallet.encryptionKey,
        senderRailgunAddress: wallet.railgunAddress,
        userAddress: address,
        inputTokenAddress: inputToken.address,
        outputTokenAddress: outputToken.address,
        inputAmount: quote.inputAmount.toString(),
        minimumOutput: quote.minimumReceived.toString(),
        poolAddress: '0x0000000000000000000000000000000000000000', // Placeholder - will be determined by DEX adapter
        inputTokenDecimals: inputToken.decimals,
        outputTokenDecimals: outputToken.decimals,
        permitData,
        uniswapData: {
          fee: Math.floor(quote.route.poolFees[0] * 10000), // Convert back to fee tier
        },
      };

      // Step 3: Call API with SSE streaming
      // The API will use the standardized private swap service with Uniswap DEX adapter
      const response = await fetch('/api/swap/private/uniswap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Private swap request failed');
      }

      // Step 4: Read SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let result: PrivateSwapResult = { success: false };
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as PrivateSwapProgress;
              setProgress(data);

              if (data.step === 'complete') {
                result = {
                  success: true,
                  inputShieldTxHash: data.inputShieldTxHash,
                  swapTxHash: data.swapTxHash,
                  outputShieldTxHash: data.outputShieldTxHash,
                  unshieldTxHash: data.unshieldTxHash,
                };
              } else if (data.step === 'error') {
                result = {
                  success: false,
                  error: data.error || data.message,
                };
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

      return result;

    } catch (error) {
      console.error('[usePrivateSwap] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      setProgress({
        step: 'error',
        progress: 0,
        message: errorMessage,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };

    } finally {
      setIsSwapping(false);
    }
  }, [address, walletClient, wallet, signPermit]);

  return {
    executePrivateSwap,
    progress,
    isSwapping,
    reset,
  };
}
