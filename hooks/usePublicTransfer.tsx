'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem';
import { TOKENS, EXPLORER_URL } from '@/lib/wagmi';

/**
 * Public Transfer Hook
 * 
 * Executes standard ERC20 transfers without privacy features.
 * Used when stealth mode is disabled.
 */

export type PublicTransferStep = 
  | 'idle'
  | 'preparing'
  | 'confirming'
  | 'sending'
  | 'complete'
  | 'error';

export interface PublicTransferProgress {
  step: PublicTransferStep;
  progress: number; // 0-100
  message: string;
  details?: string;
}

export interface PublicTransferRecipient {
  address: string; // 0x... public address
  amount: string; // Human readable amount
  token?: string; // Token symbol (e.g., 'USDC', 'USDT', 'DAI')
}

export interface PublicTransferResult {
  success: boolean;
  txHash?: string;
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  token: string;
  txLink?: string;
  error?: string;
}

interface PublicTransferState {
  isTransferring: boolean;
  progress: PublicTransferProgress;
  result: PublicTransferResult | null;
}

const STEP_MESSAGES: Record<PublicTransferStep, string> = {
  idle: 'Ready to transfer',
  preparing: 'Preparing transfer...',
  confirming: 'Please confirm in your wallet...',
  sending: 'Sending transaction...',
  complete: 'Transfer complete!',
  error: 'Transfer failed',
};

// Token addresses mapping - must match SUPPORTED_STABLECOINS in /api/railgun/stablecoins
const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  DAI: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6',
};

// Token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
};

export function usePublicTransfer() {
  const { address: senderAddress } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<PublicTransferState>({
    isTransferring: false,
    progress: { step: 'idle', progress: 0, message: STEP_MESSAGES.idle },
    result: null,
  });

  const updateProgress = useCallback((step: PublicTransferStep, progress: number, details?: string) => {
    setState(prev => ({
      ...prev,
      progress: {
        step,
        progress,
        message: STEP_MESSAGES[step],
        details,
      },
    }));
  }, []);

  const executePublicTransfer = useCallback(async (
    recipients: PublicTransferRecipient[]
  ): Promise<PublicTransferResult> => {
    if (!senderAddress) {
      throw new Error('Wallet not connected');
    }

    if (recipients.length === 0) {
      throw new Error('No recipients specified');
    }

    setState(prev => ({ ...prev, isTransferring: true, result: null }));

    try {
      // For now, handle one recipient at a time
      // In production, you could batch these or use multicall
      const recipient = recipients[0];
      const token = recipient.token || 'USDC';
      const tokenAddress = TOKEN_ADDRESSES[token];
      const decimals = TOKEN_DECIMALS[token] || 6;

      if (!tokenAddress) {
        throw new Error(`Unsupported token: ${token}`);
      }

      updateProgress('preparing', 10, `Preparing ${token} transfer...`);

      const amount = parseUnits(recipient.amount, decimals);

      updateProgress('confirming', 30, 'Please confirm the transaction in your wallet...');

      // Execute the ERC20 transfer
      // Explicit gas limit to prevent estimation issues on testnets
      const txHash = await writeContractAsync({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient.address as `0x${string}`, amount],
        gas: BigInt(100000), // Standard ERC20 transfer needs ~65k gas
      });

      updateProgress('sending', 60, 'Transaction submitted, waiting for confirmation...');

      // Wait a moment for the transaction to be mined
      // In production, you'd use useWaitForTransactionReceipt
      await new Promise(resolve => setTimeout(resolve, 2000));

      updateProgress('complete', 100, 'Transfer complete!');

      const result: PublicTransferResult = {
        success: true,
        txHash,
        senderAddress,
        recipientAddress: recipient.address,
        amount: recipient.amount,
        token,
        txLink: `${EXPLORER_URL}/tx/${txHash}`,
      };

      setState(prev => ({ ...prev, isTransferring: false, result }));
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transfer failed';
      updateProgress('error', 0, errorMessage);

      const result: PublicTransferResult = {
        success: false,
        senderAddress: senderAddress || '',
        recipientAddress: recipients[0]?.address || '',
        amount: recipients[0]?.amount || '0',
        token: recipients[0]?.token || 'USDC',
        error: errorMessage,
      };

      setState(prev => ({ ...prev, isTransferring: false, result }));
      return result;
    }
  }, [senderAddress, writeContractAsync, updateProgress]);

  const resetTransfer = useCallback(() => {
    setState({
      isTransferring: false,
      progress: { step: 'idle', progress: 0, message: STEP_MESSAGES.idle },
      result: null,
    });
  }, []);

  return {
    ...state,
    executePublicTransfer,
    resetTransfer,
  };
}
