/**
 * Private Swap Types
 * 
 * Shared types for private swap via RAILGUN.
 * Used by both server-side service and client-side hook.
 */

import type { PermitData } from '@/lib/railgun/types';

/**
 * Steps in the private swap flow
 */
export type PrivateSwapStep = 
  | 'preparing'
  | 'approving'
  | 'shielding_input'
  | 'waiting_poi_input'
  | 'generating_proof_input'
  | 'unshielding_to_relayer'
  | 'executing_swap'
  | 'shielding_output'
  | 'waiting_poi_output'
  | 'generating_proof_output'
  | 'unshielding_output'
  | 'complete'
  | 'error';

/**
 * Progress update during private swap
 */
export interface PrivateSwapProgress {
  step: PrivateSwapStep;
  progress: number; // 0-100
  message: string;
  inputShieldTxHash?: string;
  swapTxHash?: string;
  outputShieldTxHash?: string;
  unshieldTxHash?: string;
  error?: string;
}

/**
 * Result of a private swap operation
 */
export interface PrivateSwapResult {
  success: boolean;
  inputShieldTxHash?: string;
  swapTxHash?: string;
  outputShieldTxHash?: string;
  unshieldTxHash?: string;
  outputAmount?: string;
  error?: string;
}

/**
 * Request body for private swap API
 */
export interface PrivateSwapRequest {
  // RAILGUN wallet info
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;
  
  // Swap parameters
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputAmount: string;
  minimumOutput: string;
  poolAddress: string;
  
  // Token decimals (needed for proper amount handling)
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  
  // Permit for gasless approval
  permitData?: PermitData;
}

/**
 * Step messages for UI display
 */
export const PRIVATE_SWAP_MESSAGES: Record<PrivateSwapStep, string> = {
  preparing: 'Preparing private swap...',
  approving: 'Processing gasless approval...',
  shielding_input: 'Shielding input tokens...',
  waiting_poi_input: 'Verifying privacy (1-2 min)...',
  generating_proof_input: 'Generating ZK proof...',
  unshielding_to_relayer: 'Preparing for swap...',
  executing_swap: 'Executing swap on pool...',
  shielding_output: 'Shielding output tokens...',
  waiting_poi_output: 'Verifying output privacy...',
  generating_proof_output: 'Generating final proof...',
  unshielding_output: 'Delivering tokens...',
  complete: 'Private swap complete!',
  error: 'Swap failed',
};

/**
 * Get progress percentage for a step
 */
export function getStepProgress(step: PrivateSwapStep): number {
  const progressMap: Record<PrivateSwapStep, number> = {
    preparing: 5,
    approving: 10,
    shielding_input: 15,
    waiting_poi_input: 30,
    generating_proof_input: 45,
    unshielding_to_relayer: 55,
    executing_swap: 65,
    shielding_output: 75,
    waiting_poi_output: 85,
    generating_proof_output: 92,
    unshielding_output: 97,
    complete: 100,
    error: 0,
  };
  return progressMap[step];
}
