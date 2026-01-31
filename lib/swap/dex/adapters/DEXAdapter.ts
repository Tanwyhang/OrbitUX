/**
 * DEX Adapter Interface
 *
 * Standardized interface for executing swaps on any DEX contract
 * Used by the privacy layer (RAILGUN) to interact with different protocols
 */

import { Contract } from 'ethers';
import type { TransactionGasDetails } from '@railgun-community/shared-models';

/**
 * DEX swap parameters
 */
export interface DexSwapParams {
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputAmount: bigint;
  minimumOutput: bigint;
  recipientAddress: string;
  slippage: number;
}

/**
 * Quote response from DEX
 */
export interface DexQuote {
  inputAmount: bigint;
  outputAmount: bigint;
  minimumReceived: bigint;
  priceImpact: number;
  executionPrice: number;
  estimatedGas: bigint;
  // DEX-specific data needed for execution
  dexSpecificData: any;
}

/**
 * Result of DEX swap execution
 */
export interface DexSwapResult {
  success: boolean;
  txHash?: string;
  outputAmount?: bigint;
  error?: string;
}

/**
 * DEX Adapter Interface
 *
 * All DEXs must implement this interface to work with the privacy layer
 */
export interface IDexAdapter {
  /**
   * DEX name for display
   */
  readonly name: string;

  /**
   * DEX identifier
   */
  readonly id: string;

  /**
   * Get a quote for swapping tokens
   *
   * @param params - Swap parameters
   * @returns Quote or null if no route available
   */
  getQuote(params: DexSwapParams): Promise<DexQuote | null>;

  /**
   * Execute swap on the DEX
   *
   * This is called by the relayer after the privacy layer unshields tokens
   *
   * @param contract - The DEX contract instance
   * @param params - Swap parameters
   * @param dexSpecificData - Data from the quote phase
   * @param gasDetails - Gas details for transaction
   * @returns Transaction result
   */
  executeSwap(
    contract: Contract,
    params: DexSwapParams,
    dexSpecificData: any,
    gasDetails: TransactionGasDetails
  ): Promise<DexSwapResult>;

  /**
   * Get the contract address for this DEX on a specific chain
   */
  getContractAddress(chainId: number): string;

  /**
   * Get the ABI for this DEX's swap contract
   */
  getContractABI(): any[];
}
