'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { parseUnits } from 'ethers';
import { useRailgunWallet } from './useRailgunWallet';
import { useRailgunEngine } from './useRailgunEngine';
import { TOKENS, EXPLORER_URL } from '@/lib/wagmi';

/**
 * Private Transfer Hook
 * 
 * Implements the full private transfer flow via API:
 * 1. Approve tokens for RAILGUN
 * 2. Shield (sender public → sender private)
 * 3. Wait for POI verification (~60s)
 * 4. Generate ZK proof
 * 5. Unshield (sender private → recipient public)
 * 
 * From the user's perspective: Send to public 0x address,
 * but under the hood it goes through RAILGUN for privacy.
 */

export type TransferStep = 
  | 'idle'
  | 'preparing'
  | 'approving'
  | 'shielding'
  | 'waiting_poi'
  | 'generating_proof'
  | 'transferring'
  | 'unshielding'
  | 'complete'
  | 'error';

export interface TransferProgress {
  step: TransferStep;
  progress: number; // 0-100
  message: string;
  details?: string;
}

export interface TransferRecipient {
  address: string; // 0x... public address
  amount: string; // Human readable amount
  token?: string; // Token symbol (e.g., 'USDC', 'USDT', 'DAI')
}

export interface TransferResult {
  success: boolean;
  shieldTxHash?: string;
  unshieldTxHash?: string;
  // For privacy comparison display
  senderInfo: {
    publicAddress: string;
    railgunAddress: string;
  };
  recipientInfo: {
    publicAddress: string;
  };
  // Proof that transactions are unlinkable
  privacyProof: {
    shieldTxLink: string;
    unshieldTxLink: string;
    explanation: string;
  };
  error?: string;
}

interface PrivateTransferState {
  isTransferring: boolean;
  progress: TransferProgress;
  result: TransferResult | null;
}

const STEP_MESSAGES: Record<TransferStep, string> = {
  idle: 'Ready to transfer',
  preparing: 'Preparing transfer...',
  approving: 'Approving USDC for RAILGUN...',
  shielding: 'Shielding tokens to private balance...',
  waiting_poi: 'Waiting for Proof of Innocence verification...',
  generating_proof: 'Generating ZK Proof...',
  transferring: 'Executing private transfer...',
  unshielding: 'Unshielding to recipient...',
  complete: 'Transfer complete!',
  error: 'Transfer failed',
};

export function usePrivateTransfer() {
  const { address: senderAddress } = useAccount();
  const { wallet, mnemonic } = useRailgunWallet();
  const { status: engineStatus, initialize: initEngine } = useRailgunEngine();

  const [state, setState] = useState<PrivateTransferState>({
    isTransferring: false,
    progress: { step: 'idle', progress: 0, message: STEP_MESSAGES.idle },
    result: null,
  });

  const updateProgress = useCallback((step: TransferStep, progress: number, details?: string) => {
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

  const executePrivateTransfer = useCallback(async (
    recipients: TransferRecipient[],
    tokenAddress: string = TOKENS.USDC,
    signerPrivateKey?: string // Optional: for self-signing mode
  ): Promise<TransferResult> => {
    if (!senderAddress || !wallet) {
      throw new Error('Wallet not connected or RAILGUN wallet not initialized');
    }

    setState(prev => ({ ...prev, isTransferring: true, result: null }));
    
    const totalAmount = recipients.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
    const amountBigInt = parseUnits(totalAmount.toString(), 6); // USDC has 6 decimals

    try {
      // Ensure engine is initialized
      updateProgress('preparing', 5, 'Initializing RAILGUN engine...');
      
      if (engineStatus !== 'ready') {
        await initEngine();
      }

      updateProgress('preparing', 10, 'Preparing transfer request...');

      // For hackathon demo: we need a signer private key for self-signing
      // In production, you'd use a broadcaster or user's connected wallet
      if (!signerPrivateKey) {
        // Try to derive from mnemonic if available (DEMO ONLY - not secure for production)
        if (mnemonic) {
          const { ethers } = await import('ethers');
          const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
          signerPrivateKey = hdWallet.privateKey;
        } else {
          throw new Error('Signer private key required for self-signing mode');
        }
      }

      updateProgress('approving', 15, 'Starting transfer (this may take 2-3 minutes)...');

      // Call the transfer API - this handles the full flow server-side
      const response = await fetch('/api/railgun/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderWalletID: wallet.walletID,
          senderEncryptionKey: wallet.encryptionKey,
          senderRailgunAddress: wallet.railgunAddress,
          recipientAddress: recipients[0].address,
          tokenAddress,
          amount: amountBigInt.toString(),
          signerPrivateKey,
        }),
      });

      // Show progress updates while waiting
      // The API call can take 2-3 minutes for the full flow
      updateProgress('shielding', 25, 'Shielding tokens...');
      
      // Wait a bit then update to POI step
      await new Promise(r => setTimeout(r, 3000));
      updateProgress('waiting_poi', 35, 'Waiting for POI verification (~60 seconds)...');

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Transfer failed');
      }

      updateProgress('complete', 100, 'Transfer complete!');

      const result: TransferResult = {
        success: true,
        shieldTxHash: data.shieldTxHash,
        unshieldTxHash: data.unshieldTxHash,
        senderInfo: {
          publicAddress: senderAddress,
          railgunAddress: data.senderRailgunAddress || wallet.railgunAddress,
        },
        recipientInfo: {
          publicAddress: recipients[0].address,
        },
        privacyProof: {
          shieldTxLink: `${EXPLORER_URL}/tx/${data.shieldTxHash}`,
          unshieldTxLink: `${EXPLORER_URL}/tx/${data.unshieldTxHash}`,
          explanation: 
            `Your transfer used two separate transactions that cannot be linked on-chain:\n\n` +
            `1. Shield TX (${data.shieldTxHash?.slice(0, 10)}...): Your tokens entered RAILGUN's private pool. ` +
            `Observers see YOU sending to the RAILGUN contract.\n\n` +
            `2. Unshield TX (${data.unshieldTxHash?.slice(0, 10)}...): Tokens exited to the recipient. ` +
            `Observers see the RAILGUN contract sending to the RECIPIENT.\n\n` +
            `There is NO on-chain link between your address (${senderAddress.slice(0, 10)}...) ` +
            `and the recipient (${recipients[0].address.slice(0, 10)}...). ` +
            `The ZK proof ensures the transfer is valid without revealing the connection.`,
        },
      };

      setState(prev => ({ ...prev, isTransferring: false, result }));
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transfer failed';
      updateProgress('error', 0, errorMessage);
      
      const result: TransferResult = {
        success: false,
        senderInfo: {
          publicAddress: senderAddress,
          railgunAddress: wallet.railgunAddress,
        },
        recipientInfo: {
          publicAddress: recipients[0]?.address || '',
        },
        privacyProof: {
          shieldTxLink: '',
          unshieldTxLink: '',
          explanation: '',
        },
        error: errorMessage,
      };

      setState(prev => ({ ...prev, isTransferring: false, result }));
      return result;
    }
  }, [senderAddress, wallet, mnemonic, engineStatus, initEngine, updateProgress]);

  const resetTransfer = useCallback(() => {
    setState({
      isTransferring: false,
      progress: { step: 'idle', progress: 0, message: STEP_MESSAGES.idle },
      result: null,
    });
  }, []);

  return {
    ...state,
    executePrivateTransfer,
    resetTransfer,
  };
}
