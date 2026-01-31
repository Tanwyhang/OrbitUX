/**
 * Stargate Bridge Service (Fixed)
 * Handles USDT bridging between Arbitrum and Polygon
 */

import {
  STARGATE_ROUTER_ADDRESS,
  STARGATE_USDT_POOL_ID,
  LAYER_ZERO_CHAIN_ID,
  getUSDTConfig,
} from '@/lib/swap/unifiedConfig';
import { STARGATE_ROUTER_ABI, ERC20_ABI } from './stargateAbi';
import type { StargateQuote, StargateBridgeParams, StargateBridgeResult } from './stargateTypes';
import type { SupportedChainId } from '@/lib/swap/unifiedConfig';
import type { PublicClient, WalletClient } from 'viem';

// ============================================================================
// Constants
// ============================================================================

// Stargate fee (typically 0.06% but varies by pool)
const BRIDGE_FEE_PERCENTAGE = 0.0006; // 0.06%
const DST_GAS_FOR_CALL = BigInt(150000); // Gas for destination contract call

// Estimated bridge times (in seconds)
const ESTIMATED_BRIDGE_TIMES: Record<SupportedChainId, number> = {
  42161: 300, // Arbitrum -> Polygon: ~5 minutes
  137: 300,   // Polygon -> Arbitrum: ~5 minutes
};

// ============================================================================
// Quote Service
// ============================================================================

/**
 * Get a bridge quote for USDT transfer
 */
export async function getBridgeQuote(
  fromChainId: SupportedChainId,
  toChainId: SupportedChainId,
  amountIn: bigint,
  slippagePercent: number = 0.5
): Promise<StargateQuote | null> {
  try {
    // Validate same-chain check
    if (fromChainId === toChainId) {
      throw new Error('Cannot bridge to same chain');
    }

    // Calculate bridge fee (0.06%)
    const bridgeFee = (amountIn * BigInt(Math.floor(BRIDGE_FEE_PERCENTAGE * 10000))) / BigInt(10000);

    // Calculate output amount (input minus fee)
    const amountOut = amountIn - bridgeFee;

    // Calculate minimum amount with slippage
    const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100));
    const minAmountOut = (amountOut * slippageFactor) / BigInt(10000);

    // Get pool IDs
    const srcPoolId = BigInt(STARGATE_USDT_POOL_ID[fromChainId]);
    const dstPoolId = BigInt(STARGATE_USDT_POOL_ID[toChainId]);

    // Calculate price impact (minimal for stablecoins)
    const priceImpact = (amountIn > BigInt(0)) ? (Number(bridgeFee) / Number(amountIn)) * 100 : 0;

    return {
      fromChainId,
      toChainId,
      amountIn,
      amountOut,
      bridgeFee,
      minAmountOut,
      srcPoolId,
      dstPoolId,
      estimatedDuration: ESTIMATED_BRIDGE_TIMES[fromChainId] || 300,
      priceImpact,
    };
  } catch (error) {
    console.error('Error getting bridge quote:', error);
    return null;
  }
}

// ============================================================================
// Bridge Execution
// ============================================================================

/**
 * Execute a bridge transaction using Stargate
 */
export async function executeBridge(
  params: StargateBridgeParams,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<StargateBridgeResult> {
  try {
    const routerAddress = STARGATE_ROUTER_ADDRESS;
    const usdtConfig = getUSDTConfig(params.quote.fromChainId);
    const [account] = await walletClient.getAddresses();

    // Step 1: Check and approve tokens if needed
    const allowance = await publicClient.readContract({
      address: usdtConfig.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, routerAddress],
    });

    if (allowance < params.quote.amountIn) {
      // Approve the router to spend USDT
      const approveTx = await walletClient.writeContract({
        address: usdtConfig.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress, params.quote.amountIn],
        account,
        chain: null,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // Step 2: Execute the bridge transaction
    const layerZeroDstChainId = LAYER_ZERO_CHAIN_ID[params.quote.toChainId];

    const hash = await walletClient.writeContract({
      address: routerAddress,
      abi: STARGATE_ROUTER_ABI,
      functionName: 'swap',
      args: [
        layerZeroDstChainId,                          // dstChainId (LayerZero ID)
        params.quote.srcPoolId,                       // srcPoolId
        params.quote.dstPoolId,                       // dstPoolId
        account,                                      // refundAddress
        encodeAmount(params.quote.amountIn),          // amountIn (as bytes32)
        params.quote.minAmountOut,                    // minAmountOut
        params.dstGasForCall || DST_GAS_FOR_CALL,     // dstGasForCall
        '0x',                                         // lzTxParams (empty)
        encodeRecipient(params.recipient),            // to address (as bytes)
        '0x',                                         // extraData (empty)
      ],
      value: BigInt(0),
      account,
      chain: null,
    });

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      return {
        success: true,
        txHash: hash,
        amountOut: params.quote.amountOut,
      };
    } else {
      return {
        success: false,
        error: 'Transaction failed',
      };
    }
  } catch (error) {
    console.error('Bridge execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Encode amount to bytes32 format required by Stargate
 * Stargate requires amounts in 18 decimals internally (LD format)
 */
function encodeAmount(amount: bigint): `0x${string}` {
  // USDT is 6 decimals, but Stargate uses 18 decimals internally
  // Convert to 18 decimals (LD = Local Decimal)
  const amountInLD = amount * BigInt(10) ** BigInt(12); // 6 -> 18 decimals
  const hex = amountInLD.toString(16).padStart(64, '0');
  return `0x${hex}` as `0x${string}`;
}

/**
 * Encode recipient address to bytes format required by Stargate
 * Pads address to 32 bytes
 */
function encodeRecipient(address: `0x${string}`): `0x${string}` {
  const cleaned = address.replace('0x', '').toLowerCase();
  const padded = cleaned.padStart(64, '0');
  return `0x${padded}` as `0x${string}`;
}

/**
 * Calculate minimum output with slippage
 */
export function calculateMinOutput(amount: bigint, slippagePercent: number): bigint {
  const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100));
  return (amount * slippageFactor) / BigInt(10000);
}
