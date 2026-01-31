'use client';

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import type { Address, Hex } from 'viem';
import { useRailgunWallet } from './useRailgunWallet';
import { RELAYER_ADDRESS } from '@/lib/wagmi';
import type {
  PrivateBridgeProgress,
  PrivateBridgeResult,
  PrivateBridgeRequest,
} from '@/lib/swap/privateBridgeTypes';
import { PRIVATE_BRIDGE_MESSAGES } from '@/lib/swap/privateBridgeTypes';
import type { PermitData } from '@/lib/railgun/types';

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

const NONCES_ABI = [
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface UsePrivateBridgeResult {
  executePrivateBridge: (request: PrivateBridgeRequest) => Promise<PrivateBridgeResult>;
  progress: PrivateBridgeProgress | null;
  isBridging: boolean;
  reset: () => void;
}

/**
 * Hook for executing private cross-chain bridges via RAILGUN
 *
 * Flow:
 * 1. Sign gasless permit for input token
 * 2. Call /api/swap/private/bridge which streams progress via SSE
 * 3. Server orchestrates source chain privacy, bridge, destination delivery
 * 4. Return result with all TX hashes from both chains
 */
export function usePrivateBridge(): UsePrivateBridgeResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { wallet } = useRailgunWallet();

  const [progress, setProgress] = useState<PrivateBridgeProgress | null>(null);
  const [isBridging, setIsBridging] = useState(false);

  const reset = useCallback(() => {
    setProgress(null);
    setIsBridging(false);
  }, []);

  const getTokenDomain = useCallback((tokenAddress: string, chainId: number) => {
    // Get token domain for permit signing
    // For USDT (Tether USD token)
    return {
      name: 'Tether USD',
      version: '1',
      chainId: chainId,
      verifyingContract: tokenAddress as Address,
    };
  }, []);

  const signPermit = useCallback(async (
    tokenAddress: string,
    amount: bigint,
    deadline: bigint,
    chainId: number
  ): Promise<PermitData> => {
    if (!walletClient || !address || !publicClient) {
      throw new Error('Wallet not connected');
    }

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

    const signature = await walletClient.signTypedData({
      account: address,
      domain,
      types: PERMIT_TYPES,
      primaryType: 'Permit',
      message,
    });

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

  const executePrivateBridge = useCallback(async (
    request: PrivateBridgeRequest
  ): Promise<PrivateBridgeResult> => {
    if (!address || !walletClient || !wallet) {
      return {
        success: false,
        sourceChainId: request.sourceChainId,
        destinationChainId: request.destinationChainId,
        error: 'Wallet not connected or RAILGUN wallet not initialized',
      };
    }

    setIsBridging(true);
    setProgress({
      step: 'preparing',
      progress: 0,
      message: PRIVATE_BRIDGE_MESSAGES.preparing,
      sourceChainId: request.sourceChainId,
      destinationChainId: request.destinationChainId,
    });

    try {
      // Step 1: Sign permit
      setProgress({
        step: 'approving',
        progress: 5,
        message: 'Please sign the approval in your wallet...',
        sourceChainId: request.sourceChainId,
        destinationChainId: request.destinationChainId,
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Convert decimal string to BigInt (e.g., "0.5" -> 500000 for 6 decimals)
      const amountFloat = parseFloat(request.inputAmount);
      const amountBigInt = BigInt(Math.floor(amountFloat * (10 ** request.inputTokenDecimals)));

      const permitData = await signPermit(
        request.inputTokenAddress,
        amountBigInt,
        deadline,
        request.sourceChainId
      );

      // Step 2: Call API with SSE streaming
      const response = await fetch('/api/swap/private/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          permitData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Private bridge request failed');
      }

      // Step 3: Read SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let result: PrivateBridgeResult = {
        success: false,
        sourceChainId: request.sourceChainId,
        destinationChainId: request.destinationChainId,
      };
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as PrivateBridgeProgress;
              setProgress(data);

              if (data.step === 'complete') {
                result = {
                  success: true,
                  sourceChainId: data.sourceChainId,
                  destinationChainId: data.destinationChainId,
                  inputShieldTxHash: data.inputShieldTxHash,
                  unshieldTxHash: data.unshieldTxHash,
                  bridgeTxHash: data.bridgeTxHash,
                  destShieldTxHash: data.destShieldTxHash,
                  outputAmount: data.outputAmount,
                };
              } else if (data.step === 'error') {
                result = {
                  success: false,
                  sourceChainId: data.sourceChainId,
                  destinationChainId: data.destinationChainId,
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
      console.error('[usePrivateBridge] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      setProgress({
        step: 'error',
        progress: 0,
        message: errorMessage,
        error: errorMessage,
        sourceChainId: request.sourceChainId,
        destinationChainId: request.destinationChainId,
      });

      return {
        success: false,
        sourceChainId: request.sourceChainId,
        destinationChainId: request.destinationChainId,
        error: errorMessage,
      };

    } finally {
      setIsBridging(false);
    }
  }, [address, walletClient, wallet, signPermit]);

  return {
    executePrivateBridge,
    progress,
    isBridging,
    reset,
  };
}
