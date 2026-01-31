'use client';

import { useState, useCallback } from 'react';
<<<<<<< Updated upstream
import { useAccount } from 'wagmi';
import { parseUnits } from 'ethers';
=======
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { parseUnits, erc20Abi, type Address, type Hex } from 'viem';
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  const { wallet, mnemonic } = useRailgunWallet();
=======
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { wallet } = useRailgunWallet();
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
  /**
   * Get permit domain for a token
   * Each EIP-2612 token has its own domain with specific name/version
   */
  const getTokenDomain = useCallback((tokenAddress: string) => {
    const normalized = tokenAddress.toLowerCase();

    // Look up token metadata for proper domain values
    for (const [addr, meta] of Object.entries(TOKEN_METADATA)) {
      if (addr.toLowerCase() === normalized) {
        return {
          name: meta.name,
          version: meta.version || '1',
          chainId: chainId,
          verifyingContract: tokenAddress as Address,
        };
      }
    }

    // Fallback for unknown tokens - this may fail if domain doesn't match
    console.warn(`[PrivateTransfer] Unknown token ${tokenAddress}, using default permit domain`);
    return {
      name: 'Token',
      version: '1',
      chainId: chainId,
      verifyingContract: tokenAddress as Address,
    };
  }, [chainId]);

  /**
   * Sign an EIP-2612 permit for gasless approval
   * @param tokenAddress - The token to sign permit for
   * @param amount - Amount to approve
   * @param deadline - Permit expiration timestamp
   */
  const signPermit = useCallback(async (
    tokenAddress: string,
    amount: bigint,
    deadline: bigint
  ): Promise<PermitData> => {
    if (!walletClient || !senderAddress || !publicClient) {
      throw new Error('Wallet not connected');
    }

    // Get current nonce for user
    const nonce = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [senderAddress],
    });

    const domain = getTokenDomain(tokenAddress);

    const message = {
      owner: senderAddress,
      spender: RELAYER_ADDRESS,
      value: amount,
      nonce,
      deadline,
    };

    // Request signature from wallet
    const signature = await walletClient.signTypedData({
      account: senderAddress,
      domain,
      types: PERMIT_TYPES,
      primaryType: 'Permit',
      message,
    });

    // Parse signature into v, r, s
    const r = `0x${signature.slice(2, 66)}` as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return {
      owner: senderAddress,
      spender: RELAYER_ADDRESS,
      value: amount.toString(),
      deadline: deadline.toString(),
      v,
      r,
      s,
    };
  }, [walletClient, senderAddress, publicClient, getTokenDomain]);

  /**
   * Check if user already has sufficient allowance
   */
  const checkAllowance = useCallback(async (
    amount: bigint,
    tokenAddress: string
  ): Promise<boolean> => {
    if (!publicClient || !senderAddress) return false;

    const allowance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [senderAddress, RELAYER_ADDRESS],
    });

    return allowance >= amount;
  }, [publicClient, senderAddress]);

  /**
   * Execute a private transfer supporting multiple recipients and tokens.
   * 
   * @param recipients - Array of recipients, each with address, amount, and optional token
   * @param defaultTokenAddress - Default token for recipients without explicit token
   */
>>>>>>> Stashed changes
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
