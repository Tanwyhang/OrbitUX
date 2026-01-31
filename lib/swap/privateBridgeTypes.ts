/**
 * Private Bridge Types
 *
 * Types for private cross-chain bridges via RAILGUN + Stargate
 * Supports end-to-end privacy: source chain shielding + destination chain shielding
 */

import type { SupportedChainId } from './unifiedConfig';
import type { PermitData } from '@/lib/railgun/types';

/**
 * Private bridge operation modes
 */
export type PrivateBridgeMode = 'bridge_only' | 'bridge_and_swap';

/**
 * Destination delivery options
 */
export type DestinationDelivery =
  | 'public'      // Deliver to user's public address
  | 'private';    // Re-shield to user's private balance (requires POI on dest)

/**
 * Steps in private bridge flow (cross-chain aware)
 */
export type PrivateBridgeStep =
  // Source chain: Private execution
  | 'preparing'
  | 'approving'
  | 'shielding_input'
  | 'waiting_poi_input'
  | 'generating_proof_input'
  | 'unshielding_to_relayer'
  | 'executing_bridge'
  // Cross-chain: Waiting for bridge
  | 'waiting_bridge'
  | 'bridge_confirmed'
  // Destination chain: Delivery
  | 'dest_shielding'
  | 'waiting_poi_dest'
  // Final states
  | 'complete'
  | 'error';

/**
 * Progress update during private bridge
 */
export interface PrivateBridgeProgress {
  step: PrivateBridgeStep;
  progress: number; // 0-100
  message: string;
  // Source chain
  sourceChainId: SupportedChainId;
  inputShieldTxHash?: string;
  unshieldTxHash?: string;
  bridgeTxHash?: string;
  // Destination chain
  destinationChainId: SupportedChainId;
  destShieldTxHash?: string;
  // Swap output (if bridge + swap)
  outputAmount?: string;
  // Error handling
  error?: string;
}

/**
 * Request body for private bridge API
 */
export interface PrivateBridgeRequest {
  // RAILGUN wallet info (source chain)
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;

  // Source chain parameters
  sourceChainId: SupportedChainId;
  inputTokenAddress: string;
  inputAmount: string;
  inputTokenDecimals: number;

  // Destination chain parameters
  destinationChainId: SupportedChainId;
  outputTokenAddress?: string; // Optional: if different, requires swap
  minimumOutput?: string;       // Min output after any swap

  // Bridge configuration
  mode: PrivateBridgeMode;
  destinationDelivery: DestinationDelivery;

  // Permit for gasless approval
  permitData?: PermitData;

  // Slippage tolerance (percentage)
  slippage: number;
}

/**
 * Result of private bridge operation
 */
export interface PrivateBridgeResult {
  success: boolean;
  // Source chain
  sourceChainId: SupportedChainId;
  inputShieldTxHash?: string;
  unshieldTxHash?: string;
  bridgeTxHash?: string;
  // Destination chain
  destinationChainId: SupportedChainId;
  destShieldTxHash?: string;
  outputAmount?: string;
  error?: string;
}

/**
 * Bridge adapter interface (similar to DEX adapter)
 */
export interface IBridgeAdapter {
  readonly name: string;
  readonly id: string;

  /**
   * Get a quote for bridging tokens
   */
  getQuote(params: BridgeQuoteParams): Promise<BridgeQuote | null>;

  /**
   * Execute bridge transaction
   */
  executeBridge(
    params: BridgeExecuteParams,
    gasDetails: any
  ): Promise<BridgeResult>;

  /**
   * Wait for bridge completion
   */
  waitForBridge(bridgeTxHash: string, sourceChainId: SupportedChainId, destinationChainId: SupportedChainId, recipientAddress?: string): Promise<BridgeDelivery>;
}

/**
 * Bridge quote parameters
 */
export interface BridgeQuoteParams {
  sourceChainId: SupportedChainId;
  destinationChainId: SupportedChainId;
  inputTokenAddress: string;
  outputTokenAddress?: string; // For bridge + swap
  inputAmount: bigint;
  slippage: number;
}

/**
 * Bridge quote response
 */
export interface BridgeQuote {
  sourceChainId: SupportedChainId;
  destinationChainId: SupportedChainId;
  inputAmount: bigint;
  outputAmount: bigint;          // After fees, before any swap
  swapOutputAmount?: bigint;     // After bridge + swap (if applicable)
  minimumOutput: bigint;
  bridgeFee: bigint;
  estimatedDuration: number;     // Seconds
  priceImpact: number;
}

/**
 * Bridge execution parameters
 */
export interface BridgeExecuteParams {
  sourceChainId: SupportedChainId;
  destinationChainId: SupportedChainId;
  inputTokenAddress: string;
  outputTokenAddress?: string;
  inputAmount: bigint;
  minimumOutput: bigint;
  recipientAddress: string;       // Address to receive on destination
}

/**
 * Bridge execution result
 */
export interface BridgeResult {
  success: boolean;
  txHash?: string;
  estimatedArrival: number;       // Unix timestamp
  recipientAddress?: string;       // Store recipient for tracking
  error?: string;
}

/**
 * Bridge delivery (what arrives on destination)
 */
export interface BridgeDelivery {
  success: boolean;
  destinationChainId: SupportedChainId;
  outputAmount: bigint;
  outputTokenAddress: string;
  deliveryTxHash?: string;       // If auto-delivered by bridge
  error?: string;
}

/**
 * Step messages for UI display
 */
export const PRIVATE_BRIDGE_MESSAGES: Record<PrivateBridgeStep, string> = {
  preparing: 'Preparing private bridge...',
  approving: 'Processing gasless approval...',
  shielding_input: 'Shielding tokens privately...',
  waiting_poi_input: 'Verifying privacy (1-2 min)...',
  generating_proof_input: 'Generating ZK proof...',
  unshielding_to_relayer: 'Preparing bridge...',
  executing_bridge: 'Executing cross-chain bridge...',
  waiting_bridge: 'Cross-chain transfer in progress...',
  bridge_confirmed: 'Bridge confirmed, shielding on destination...',
  dest_shielding: 'Shielding on destination chain...',
  waiting_poi_dest: 'Verifying destination privacy...',
  complete: 'End-to-end private bridge complete!',
  error: 'Bridge failed',
};

/**
 * Get progress percentage for a step
 */
export function getBridgeStepProgress(step: PrivateBridgeStep): number {
  const progressMap: Record<PrivateBridgeStep, number> = {
    preparing: 5,
    approving: 10,
    shielding_input: 15,
    waiting_poi_input: 30,
    generating_proof_input: 45,
    unshielding_to_relayer: 55,
    executing_bridge: 65,
    waiting_bridge: 75,
    bridge_confirmed: 80,
    dest_shielding: 85,
    waiting_poi_dest: 92,
    complete: 100,
    error: 0,
  };
  return progressMap[step];
}
