/**
 * Stargate Bridge Types
 */

import type { SupportedChainId } from '@/lib/swap/unifiedConfig';

// ============================================================================
// Quote Types
// ============================================================================

export interface StargateQuote {
  // Input
  fromChainId: SupportedChainId;
  toChainId: SupportedChainId;
  amountIn: bigint;

  // Output
  amountOut: bigint;
  bridgeFee: bigint;
  estimatedDuration: number; // in seconds

  // Pool info
  srcPoolId: bigint;
  dstPoolId: bigint;

  // Min output with slippage
  minAmountOut: bigint;

  // Price impact
  priceImpact: number;
}

export interface StargateBridgeParams {
  quote: StargateQuote;
  recipient: `0x${string}`;
  dstGasForCall?: bigint;
}

export interface StargateBridgeResult {
  success: boolean;
  txHash?: `0x${string}`;
  amountOut?: bigint;
  error?: string;
}

// ============================================================================
// Layer Zero Chain IDs (used by Stargate)
// ============================================================================

export const LAYER_ZERO_CHAIN_IDS: Record<SupportedChainId, number> = {
  42161: 110, // Arbitrum
  137: 109,   // Polygon
} as const;
