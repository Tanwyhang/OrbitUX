'use client';

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, erc20Abi, type Address, type Hex } from 'viem';
import { useRailgunWallet } from './useRailgunWallet';
import { useRailgunEngine } from './useRailgunEngine';
import { TOKENS, EXPLORER_URL, RELAYER_ADDRESS } from '@/lib/wagmi';
import type { GasAbstractionMethod, PermitData, TransferRecipientInput, TokenShieldResult } from '@/lib/railgun/types';

// Token metadata for supported stablecoins
// This should match the stablecoins API response
const TOKEN_METADATA: Record<string, { symbol: string; name: string; decimals: number; version?: string }> = {
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238': { symbol: 'USDC', name: 'USDC', decimals: 6, version: '2' },
  '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06': { symbol: 'USDT', name: 'TetherToken', decimals: 6, version: '1' },
  '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, version: '1' },
};

/**
 * Get token decimals for a given token address
 * Defaults to 18 decimals if not found
 */
function getTokenDecimals(tokenAddress: string): number {
  const normalized = tokenAddress.toLowerCase();
  for (const [addr, meta] of Object.entries(TOKEN_METADATA)) {
    if (addr.toLowerCase() === normalized) {
      return meta.decimals;
    }
  }
  return 18; // Default to 18 decimals
}

/**
 * Private Transfer Hook with Full Gas Abstraction
 * 
 * Implements the full private transfer flow via API with ZERO gas cost to user:
 * 
 * Supports multi-token batch transfers:
 * 1. User signs permits (one per unique token, gasless EIP-2612)
 * 2. Relayer executes permits on-chain (paying gas)
 * 3. Shield each token separately (one TX per token) - relayer pays gas
 * 4. Wait for POI verification (~60s)
 * 5. Generate single ZK proof for all recipients
 * 6. Single unshield TX to all recipients - relayer pays gas
 * 
 * From the user's perspective: Sign N permits (one per token), transfer happens privately.
 * User pays ZERO gas - relayer sponsors everything.
 */

export type TransferStep = 
  | 'idle'
  | 'preparing'
  | 'signing'         // User signing permit/authorization
  | 'signing_token'   // Signing permit for specific token
  | 'approving'       // Relayer executing permit on-chain
  | 'shielding'
  | 'shielding_token' // Shielding specific token
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
  // Batch transfer info
  currentRecipientIndex?: number;
  totalRecipients?: number;
  recipients?: TransferRecipient[];
  // Multi-token info
  currentTokenIndex?: number;
  totalTokens?: number;
  currentToken?: string;
  // Per-token shield results
  shieldResults?: TokenShieldResult[];
  // ZK proof generation progress (0-100) for current recipient
  zkProofProgress?: number;
}

export interface TransferRecipient {
  address: string; // 0x... public address
  amount: string; // Human readable amount
  token?: string; // Token symbol (e.g., 'USDC', 'USDT', 'DAI')
  // Populated after transfer
  shieldTxHash?: string;
  unshieldTxHash?: string;
  status?: 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
}

export interface TransferResult {
  success: boolean;
  // For single transfers (backward compat)
  shieldTxHash?: string;
  unshieldTxHash?: string;
  // For batch transfers
  recipients: TransferRecipient[];
  // For multi-token transfers
  shieldResults?: TokenShieldResult[];
  // For privacy comparison display
  senderInfo: {
    publicAddress: string;
    railgunAddress: string;
  };
  // Legacy single recipient (backward compat)
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
  signing_token: 'Sign approval for token...',
  approving: 'Relayer processing approval...',
  shielding: 'Shielding tokens to private balance...',
  shielding_token: 'Shielding token...',
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

  const updateProgress = useCallback((
    step: TransferStep, 
    progress: number, 
    details?: string,
    recipientInfo?: { currentIndex?: number; total?: number; recipients?: TransferRecipient[] },
    tokenInfo?: { currentIndex?: number; total?: number; currentToken?: string },
    shieldResults?: TokenShieldResult[]
  ) => {
    setState(prev => ({
      ...prev,
      progress: {
        step,
        progress,
        message: STEP_MESSAGES[step],
        details,
        currentRecipientIndex: recipientInfo?.currentIndex,
        totalRecipients: recipientInfo?.total,
        recipients: recipientInfo?.recipients,
        currentTokenIndex: tokenInfo?.currentIndex,
        totalTokens: tokenInfo?.total,
        currentToken: tokenInfo?.currentToken,
        shieldResults,
      },
    }));
  }, []);

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
          chainId: 11155111, // Sepolia
          verifyingContract: tokenAddress as Address,
        };
      }
    }
    
    // Fallback for unknown tokens - this may fail if domain doesn't match
    console.warn(`[PrivateTransfer] Unknown token ${tokenAddress}, using default permit domain`);
    return {
      name: 'Token',
      version: '1',
      chainId: 11155111, // Sepolia
      verifyingContract: tokenAddress as Address,
    };
  }, []);

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
  const executePrivateTransfer = useCallback(async (
    recipients: TransferRecipient[],
    defaultTokenAddress: string = TOKENS.USDC
  ): Promise<TransferResult> => {
    if (!senderAddress || !wallet) {
      throw new Error('Wallet not connected or RAILGUN wallet not initialized');
    }

    if (!publicClient || !walletClient) {
      throw new Error('Wallet client not available');
    }

    setState(prev => ({ ...prev, isTransferring: true, result: null }));
    
    // Normalize recipients - ensure each has a token address
    const normalizedRecipients = recipients.map(r => ({
      ...r,
      token: r.token || 'USDC',
      tokenAddress: (r as unknown as { tokenAddress?: string }).tokenAddress || defaultTokenAddress,
    }));
    
    // Track recipients with status
    const trackedRecipients: TransferRecipient[] = normalizedRecipients.map(r => ({
      ...r,
      status: 'pending' as const,
    }));
    
    const recipientInfo = { 
      currentIndex: 0, 
      total: recipients.length, 
      recipients: trackedRecipients 
    };

    try {
      // Ensure engine is initialized
      updateProgress('preparing', 5, 'Initializing RAILGUN engine...', recipientInfo);
      
      if (engineStatus !== 'ready') {
        await initEngine();
      }

      updateProgress('preparing', 10, 'Analyzing transfer...', recipientInfo);

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Group recipients by token and calculate totals
      // ════════════════════════════════════════════════════════════════
      const tokenGroups: Record<string, { 
        recipients: typeof normalizedRecipients; 
        total: bigint;
        symbol: string;
        decimals: number;
      }> = {};

      for (const recipient of normalizedRecipients) {
        const tokenAddr = recipient.tokenAddress;
        if (!tokenGroups[tokenAddr]) {
          tokenGroups[tokenAddr] = { 
            recipients: [], 
            total: BigInt(0),
            symbol: recipient.token || 'TOKEN',
            decimals: getTokenDecimals(tokenAddr),
          };
        }
        tokenGroups[tokenAddr].recipients.push(recipient);
        // Parse amount using correct decimals for this token
        const decimals = tokenGroups[tokenAddr].decimals;
        const amountBigInt = parseUnits(recipient.amount || '0', decimals);
        tokenGroups[tokenAddr].total += amountBigInt;
      }

      const tokenAddresses = Object.keys(tokenGroups);
      const tokenInfo = { currentIndex: 0, total: tokenAddresses.length, currentToken: '' };

      console.log('[PrivateTransfer] Token groups:', tokenAddresses.length);
      for (const [addr, group] of Object.entries(tokenGroups)) {
        console.log(`  ${group.symbol}: ${group.recipients.length} recipients, total: ${group.total.toString()}`);
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Check allowances and sign permits per token
      // ════════════════════════════════════════════════════════════════
      let gasAbstraction: GasAbstractionMethod = 'permit';
      const permits: Record<string, PermitData> = {};
      let allHaveAllowance = true;

      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i];
        const { total: amount, symbol } = tokenGroups[tokenAddress];

        tokenInfo.currentIndex = i;
        tokenInfo.currentToken = tokenAddress;

        // Check if already approved
        const hasAllowance = await checkAllowance(amount, tokenAddress);
        
        if (hasAllowance) {
          console.log(`[PrivateTransfer] Already has allowance for ${symbol}`);
        } else {
          allHaveAllowance = false;
          
          // Request gasless permit signature
          updateProgress(
            'signing_token', 
            10 + Math.floor((i / tokenAddresses.length) * 10),
            `Sign approval for ${symbol} (${i + 1}/${tokenAddresses.length})...`,
            recipientInfo,
            tokenInfo
          );
          
          // Permit expires in 1 hour
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
          
          try {
            permits[tokenAddress] = await signPermit(tokenAddress, amount, deadline);
            console.log(`[PrivateTransfer] Permit signed for ${symbol}`);
          } catch (signError) {
            console.error(`[PrivateTransfer] Permit signing failed for ${symbol}:`, signError);
            throw new Error(`Signature rejected for ${symbol}. Please sign all approvals to continue.`);
          }
        }
      }

      if (allHaveAllowance) {
        gasAbstraction = 'approved';
      }

      updateProgress('approving', 25, 'Sending to relayer...', recipientInfo, tokenInfo);

      // ════════════════════════════════════════════════════════════════
      // STEP 3: Build API request with batch format
      // ════════════════════════════════════════════════════════════════
      const apiRecipients: TransferRecipientInput[] = normalizedRecipients.map(r => {
        const decimals = getTokenDecimals(r.tokenAddress);
        return {
          address: r.address,
          tokenAddress: r.tokenAddress,
          amount: parseUnits(r.amount || '0', decimals).toString(),
        };
      });

      updateProgress('shielding', 30, `Shielding ${tokenAddresses.length} token(s)...`, recipientInfo, tokenInfo);

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Call API with SSE streaming for real-time progress
      // ════════════════════════════════════════════════════════════════
      const response = await fetch('/api/railgun/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderWalletID: wallet.walletID,
          senderEncryptionKey: wallet.encryptionKey,
          senderRailgunAddress: wallet.railgunAddress,
          userAddress: senderAddress,
          recipients: apiRecipients,
          permits,
          gasAbstraction,
        }),
      });

      if (!response.ok) {
        // Non-streaming error response
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transfer failed');
      }

      // Check if we got a streaming response
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('text/event-stream') && response.body) {
        // ═══════════════════════════════════════════════════════════
        // SSE Streaming: Parse real-time progress updates
        // ═══════════════════════════════════════════════════════════
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalData: {
          success: boolean;
          shieldResults?: TokenShieldResult[];
          unshieldTxHash?: string;
          recipientResults?: Array<{
            address: string;
            amount: string;
            status: string;
            unshieldTxHash?: string;
            error?: string;
          }>;
          senderRailgunAddress?: string;
          shieldTxHash?: string;
          error?: string;
        } | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Parse SSE events (format: "data: {...}\n\n")
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            
            try {
              const eventData = JSON.parse(line.slice(6)); // Remove "data: " prefix
              
              if (eventData.type === 'progress') {
                // Real-time progress update from server
                const progress = eventData.data;
                setState(prev => ({
                  ...prev,
                  progress: {
                    step: progress.step,
                    progress: progress.progress,
                    message: progress.message,
                    currentRecipientIndex: progress.currentRecipient?.current,
                    totalRecipients: progress.currentRecipient?.total,
                    currentTokenIndex: progress.currentToken?.current,
                    totalTokens: progress.currentToken?.total,
                    currentToken: progress.currentToken?.address,
                    shieldResults: progress.shieldResults,
                    recipients: recipients, // Pass actual recipients array
                  },
                }));
              } else if (eventData.type === 'complete') {
                finalData = eventData.data;
              } else if (eventData.type === 'error') {
                finalData = eventData.data;
              }
            } catch (parseError) {
              console.warn('[PrivateTransfer] Failed to parse SSE event:', line);
            }
          }
        }

        if (!finalData) {
          throw new Error('Transfer failed: no final response received');
        }

        if (!finalData.success) {
          throw new Error(finalData.error || 'Transfer failed');
        }

        // Build completed recipients list with per-recipient results
        const completedRecipients: TransferRecipient[] = recipients.map((r, idx) => {
          const recipientResult = finalData!.recipientResults?.[idx];
          const tokenAddr = normalizedRecipients[idx]?.tokenAddress || defaultTokenAddress;
          const shieldResult = finalData!.shieldResults?.find((s: TokenShieldResult) => s.tokenAddress === tokenAddr);
          
          return {
            ...r,
            shieldTxHash: shieldResult?.shieldTxHash || finalData!.shieldTxHash,
            unshieldTxHash: recipientResult?.unshieldTxHash || finalData!.unshieldTxHash,
            status: (recipientResult?.status as 'pending' | 'processing' | 'complete' | 'error') || 'complete',
            error: recipientResult?.error,
          };
        });

        updateProgress('complete', 100, `Transfer complete! ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`, recipientInfo, tokenInfo, finalData.shieldResults);

        const result: TransferResult = {
          success: true,
          shieldTxHash: finalData.shieldTxHash,
          unshieldTxHash: finalData.unshieldTxHash,
          recipients: completedRecipients,
          shieldResults: finalData.shieldResults,
          senderInfo: {
            publicAddress: senderAddress,
            railgunAddress: finalData.senderRailgunAddress || wallet.railgunAddress,
          },
          recipientInfo: {
            publicAddress: recipients[0].address,
          },
          privacyProof: {
            shieldTxLink: `${EXPLORER_URL}/tx/${finalData.shieldTxHash}`,
            unshieldTxLink: `${EXPLORER_URL}/tx/${finalData.unshieldTxHash}`,
            explanation: tokenAddresses.length > 1
              ? `Multi-token batch transfer to ${recipients.length} recipients completed privately.`
              : recipients.length > 1
              ? `Batch transfer to ${recipients.length} recipients completed privately.`
              : `Private transfer completed.`,
          },
        };

        setState(prev => ({ ...prev, isTransferring: false, result }));
        return result;

      } else {
        // ═══════════════════════════════════════════════════════════
        // Fallback: Non-streaming JSON response (legacy)
        // ═══════════════════════════════════════════════════════════
        updateProgress('shielding', 35, 'Shielding tokens...', recipientInfo, tokenInfo);
        await new Promise(r => setTimeout(r, 3000));
        updateProgress('waiting_poi', 45, 'Waiting for POI verification (~60 seconds)...', recipientInfo, tokenInfo);

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Transfer failed');
        }

        updateProgress('complete', 100, `Transfer complete! ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`, recipientInfo, tokenInfo, data.shieldResults);

        // Build completed recipients list with per-recipient results
        const completedRecipients: TransferRecipient[] = recipients.map((r, idx) => {
          const recipientResult = data.recipientResults?.[idx];
          const tokenAddr = normalizedRecipients[idx]?.tokenAddress || defaultTokenAddress;
          const shieldResult = data.shieldResults?.find((s: TokenShieldResult) => s.tokenAddress === tokenAddr);
          
          return {
            ...r,
            shieldTxHash: shieldResult?.shieldTxHash || data.shieldTxHash,
            unshieldTxHash: recipientResult?.unshieldTxHash || data.unshieldTxHash,
            status: recipientResult?.status || 'complete',
            error: recipientResult?.error,
          };
        });

        const result: TransferResult = {
          success: true,
          shieldTxHash: data.shieldTxHash,
          unshieldTxHash: data.unshieldTxHash,
          recipients: completedRecipients,
          shieldResults: data.shieldResults,
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
            explanation: tokenAddresses.length > 1
              ? `Multi-token batch transfer to ${recipients.length} recipients completed privately.`
              : recipients.length > 1
              ? `Batch transfer to ${recipients.length} recipients completed privately.`
              : `Private transfer completed.`,
          },
        };

        setState(prev => ({ ...prev, isTransferring: false, result }));
        return result;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transfer failed';
      updateProgress('error', 0, errorMessage);
      
      // Build failed recipients list
      const failedRecipients: TransferRecipient[] = recipients.map(r => ({
        ...r,
        status: 'error' as const,
        error: errorMessage,
      }));

      const result: TransferResult = {
        success: false,
        recipients: failedRecipients,
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
