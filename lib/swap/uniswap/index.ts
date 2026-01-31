/**
 * Uniswap v3 Integration - Main Export
 */

// Re-export from unified config for consistency
export {
  SUPPORTED_CHAINS,
  UNISWAP_ROUTER_ADDRESS,
  UNISWAP_QUOTER_ADDRESS,
  UNISWAP_FACTORY_ADDRESS,
  TOKENS_BY_CHAIN,
  getTokensForChain,
  getUSDTConfig,
  getETHConfig,
  getTokenConfig,
  getChainName,
  getExplorerUrl,
  getDestinationChainId,
  getUniswapRouterAddress,
  getUniswapQuoterAddress,
  getUniswapFactoryAddress,
} from '@/lib/swap/unifiedConfig';

export type {
  SupportedChainId,
  TokenConfig,
} from '@/lib/swap/unifiedConfig';

// Types
export type {
  UniswapQuote,
  UniswapSwapParams,
  UniswapSwapResult,
  UniswapTradeType,
  QuoteOptions,
  CrossChainQuote,
  CrossChainSwapParams,
  CrossChainSwapResult,
} from './uniswapTypes';

export { UniswapError, ERROR_CODES } from './uniswapTypes';

// Quote Service
export {
  getUniswapQuote,
  getBestQuote,
} from './uniswapQuoteService';

// Swap Service
export {
  executeUniswapSwap,
  approveMultipleTokens,
} from './uniswapSwapService';

// Note: Cross-chain service disabled in favor of Stargate
// {
//   getCrossChainQuote,
//   executeCrossChainSwap,
// } from './uniswapCrossChainService';
