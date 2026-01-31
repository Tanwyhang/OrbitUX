/**
 * Uniswap v3 Swap Service
 * Executes swaps using the Uniswap v3 SwapRouter contract
 */

import { type Address, type WalletClient, type PublicClient } from 'viem';
import { getUniswapRouterAddress } from '@/lib/swap/unifiedConfig';
import type { UniswapQuote, UniswapSwapParams, UniswapSwapResult } from './uniswapTypes';

// ============================================================================
// SwapRouter ABI
// ============================================================================

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
      },
    ],
  },
] as const;

// ERC20 ABI
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============================================================================
// Constants
// ============================================================================

const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
const DEFAULT_DEADLINE_MINUTES = 20;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if token approval is needed
 */
async function checkApproval(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint
): Promise<boolean> {
  try {
    const allowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    }) as bigint;

    return allowance < amount;
  } catch (error) {
    console.error('[SwapService] Error checking approval:', error);
    return true;
  }
}

/**
 * Approve token spending
 */
async function approveToken(
  walletClient: WalletClient,
  token: Address,
  spender: Address,
  amount: bigint = MAX_UINT256
): Promise<`0x${string}`> {
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amount],
    account,
    chain: null,
  });

  return hash;
}

/**
 * Get deadline timestamp
 */
function getDeadline(minutesFromNow: number = DEFAULT_DEADLINE_MINUTES): number {
  return Math.floor(Date.now() / 1000) + minutesFromNow * 60;
}

/**
 * Check if token is native ETH (not WETH)
 */
function isNativeETH(token: Address): boolean {
  // Native ETH address is all zeros
  return token === '0x0000000000000000000000000000000000000000' ||
         token === '0x0000000000000000000000000000000000000001';
}

// ============================================================================
// Main Swap Function
// ============================================================================

/**
 * Execute a Uniswap v3 swap
 */
export async function executeUniswapSwap(
  params: UniswapSwapParams,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<UniswapSwapResult> {
  const { quote, recipient, deadline } = params;

  if (!walletClient.account) {
    return {
      success: false,
      error: 'Wallet not connected',
    };
  }

  const userAddress = walletClient.account.address;
  const swapRecipient = recipient || userAddress;
  const swapDeadline = deadline || getDeadline();

  try {
    const routerAddress = getUniswapRouterAddress(quote.inputToken.chainId);

    // Step 1: Check and approve token if needed (skip for native ETH)
    const needsApproval = quote.inputToken.symbol === 'ETH'
      ? false
      : await checkApproval(
          publicClient,
          quote.inputToken.address,
          userAddress,
          routerAddress,
          quote.inputAmount
        );

    if (needsApproval) {
      console.log('[SwapService] Approving token...');

      const approveHash = await approveToken(
        walletClient,
        quote.inputToken.address,
        routerAddress,
        quote.inputAmount
      );

      // Wait for approval confirmation
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      console.log('[SwapService] Token approved:', approveHash);
    }

    // Step 2: Execute the swap
    console.log('[SwapService] Executing swap...');

    // Handle single-hop swap
    if (quote.route.tokenPath.length === 2) {
      // For native ETH, we need to send msg.value
      const isNativeInput = quote.inputToken.symbol === 'ETH' ||
                           quote.inputToken.symbol === 'WETH';

      const swapParams = {
        tokenIn: quote.inputToken.address,
        tokenOut: quote.outputToken.address,
        fee: Math.floor(quote.route.poolFees[0] * 10000), // Convert back to fee tier
        recipient: swapRecipient,
        deadline: swapDeadline,
        amountIn: quote.inputAmount,
        amountOutMinimum: quote.minimumReceived,
        sqrtPriceLimitX96: BigInt(0),
      };

      const swapHash = await walletClient.writeContract({
        address: routerAddress,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [swapParams],
        ...(isNativeInput && { value: quote.inputAmount }),
        gas: quote.estimatedGasUsed + BigInt(50000),
        account: userAddress,
        chain: null,
      });

      // Wait for swap confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });

      console.log('[SwapService] Swap complete:', swapHash);

      return {
        success: true,
        txHash: swapHash,
        outputAmount: quote.outputAmount,
      };
    }

    // Handle multi-hop swap (not implemented yet)
    throw new Error('Multi-hop swaps not yet implemented. Please use direct swaps only.');

  } catch (error) {
    console.error('[SwapService] Swap failed:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute multi-hop swap (placeholder for future implementation)
 */
export async function executeMultiHopSwap(
  params: UniswapSwapParams,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<UniswapSwapResult> {
  // Multi-hop swaps require encoding the path and using exactInput instead of exactInputSingle
  // This is more complex and requires additional ABI definitions

  return {
    success: false,
    error: 'Multi-hop swaps not yet implemented',
  };
}

/**
 * Approve multiple tokens at once
 */
export async function approveMultipleTokens(
  walletClient: WalletClient,
  publicClient: PublicClient,
  tokens: Address[],
  spender: Address
): Promise<void> {
  for (const token of tokens) {
    try {
      const needsApproval = await checkApproval(
        publicClient,
        token,
        walletClient.account!.address,
        spender,
        MAX_UINT256
      );

      if (needsApproval) {
        await approveToken(walletClient, token, spender, MAX_UINT256);
      }
    } catch (error) {
      console.error(`[SwapService] Failed to approve token ${token}:`, error);
    }
  }
}

// Export types
export type { UniswapSwapParams, UniswapSwapResult };
