/**
 * DEX Module - Standardized Privacy Layer for Any DEX
 *
 * Exports:
 * - DEX Adapter Interface
 * - Uniswap V3 Adapter
 * - Standardized Private Swap Service
 */

// Types and Interfaces
export type {
  IDexAdapter,
  DexSwapParams,
  DexQuote,
  DexSwapResult,
} from './adapters/DEXAdapter';

// Adapters
export { UniswapV3Adapter } from './adapters/UniswapV3Adapter';

// Standardized Private Swap Service
export {
  standardizedPrivateSwapService,
} from './standardizedPrivateSwap';

export type { ProgressCallback } from './standardizedPrivateSwap';
