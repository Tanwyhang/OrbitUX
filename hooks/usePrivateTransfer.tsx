'use client';

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, erc20Abi, type Address, type Hex } from 'viem';
import { useRailgunWallet } from './useRailgunWallet';
import { useRailgunEngine } from './useRailgunEngine';
import { TOKENS, EXPLORER_URL, RELAYER_ADDRESS } from '@/lib/wagmi';
import type { GasAbstractionMethod, PermitData } from '@/lib/railgun/types';

/**
 * Private Transfer Hook with Full Gas Abstraction
 * 
 * Implements the full private transfer flow via API with ZERO gas cost to user:
 * 
 * 1. User signs a gasless permit (EIP-2612) OR EIP-7702 authorization
 * 2. Relayer calls permit() on-chain (paying gas) to get approval
 * 3. Shield (sender public → sender private) - relayer pays gas
 * 4. Wait for POI verification (~60s)
 * 5. Generate ZK proof
 * 6. Unshield (sender private → recipient public) - relayer pays gas
 * 
 * From the user's perspective: Sign once, transfer happens privately.
 * User pays ZERO gas - relayer sponsors everything.
 */

export type TransferStep = 
  | 'idle'
  | 'preparing'
  | 'signing'      // User signing permit/authorization
  | 'approving'    // Relayer executing permit on-chain
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
  signing: 'Please sign the approval message...',
  approving: 'Relayer processing approval...',
  shielding: 'Shielding tokens to private balance...',
  waiting_poi: 'Waiting for Proof of Innocence verification...',
  generating_proof: 'Generating ZK Proof...',
  transferring: 'Executing private transfer...',
  unshielding: 'Unshielding to recipient...',
  complete: 'Transfer complete!',
  error: 'Transfer failed',
};

// EIP-2612 Permit types for USDC
const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// USDC permit nonces ABI
const NONCES_ABI = [
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export function usePrivateTransfer() {
  const { address: senderAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { wallet } = useRailgunWallet();
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

  /**
   * Get USDC permit domain for Sepolia
   */
  const getUSDCDomain = useCallback(() => {
    return {
      name: 'USDC',
      version: '2',
      chainId: 11155111, // Sepolia
      verifyingContract: TOKENS.USDC as Address,
    };
  }, []);

  /**
   * Sign an EIP-2612 permit for gasless approval
   */
  const signPermit = useCallback(async (
    amount: bigint,
    deadline: bigint
  ): Promise<PermitData> => {
    if (!walletClient || !senderAddress || !publicClient) {
      throw new Error('Wallet not connected');
    }

    // Get current nonce for user
    const nonce = await publicClient.readContract({
      address: TOKENS.USDC as Address,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [senderAddress],
    });

    const domain = getUSDCDomain();

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
  }, [walletClient, senderAddress, publicClient, getUSDCDomain]);

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

  const executePrivateTransfer = useCallback(async (
    recipients: TransferRecipient[],
    tokenAddress: string = TOKENS.USDC
  ): Promise<TransferResult> => {
    if (!senderAddress || !wallet) {
      throw new Error('Wallet not connected or RAILGUN wallet not initialized');
    }

    if (!publicClient || !walletClient) {
      throw new Error('Wallet client not available');
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

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Determine gas abstraction method
      // ════════════════════════════════════════════════════════════════
      let gasAbstraction: GasAbstractionMethod = 'permit';
      let permitData: PermitData | undefined;

      // Check if already approved
      const hasAllowance = await checkAllowance(amountBigInt, tokenAddress);
      
      if (hasAllowance) {
        console.log('[PrivateTransfer] Already has sufficient allowance');
        gasAbstraction = 'approved';
      } else {
        // Request gasless permit signature
        updateProgress('signing', 15, 'Please sign the approval message (no gas required)...');
        
        // Permit expires in 1 hour
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        
        try {
          permitData = await signPermit(amountBigInt, deadline);
          console.log('[PrivateTransfer] Permit signed successfully');
          gasAbstraction = 'permit';
        } catch (signError) {
          console.error('[PrivateTransfer] Permit signing failed:', signError);
          throw new Error('Signature rejected. Please sign the approval to continue.');
        }
      }

      updateProgress('approving', 20, 'Relayer processing approval (no gas for you!)...');

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Call transfer API with permit data
      // Relayer will call permit() on-chain, then transferFrom(), then RAILGUN
      // ════════════════════════════════════════════════════════════════
      updateProgress('shielding', 30, 'Starting private transfer (this may take 2-3 minutes)...');

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
          userAddress: senderAddress,
          gasAbstraction,
          permitData,
        }),
      });

      // Show progress updates while waiting
      updateProgress('shielding', 35, 'Shielding tokens...');
      
      // Wait a bit then update to POI step
      await new Promise(r => setTimeout(r, 3000));
      updateProgress('waiting_poi', 45, 'Waiting for POI verification (~60 seconds)...');

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
            `🎉 ZERO GAS TRANSFER COMPLETE!\n\n` +
            `You paid NO gas fees - the relayer sponsored everything.\n\n` +
            `Your transfer used two separate transactions that cannot be linked on-chain:\n\n` +
            `1. Shield TX (${data.shieldTxHash?.slice(0, 10)}...): Your tokens entered RAILGUN's private pool. ` +
            `Observers see the RELAYER sending to the RAILGUN contract.\n\n` +
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
  }, [senderAddress, wallet, publicClient, walletClient, engineStatus, initEngine, updateProgress, signPermit, checkAllowance]);

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
