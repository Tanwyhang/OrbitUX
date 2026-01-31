/**
 * Unified Token Configuration for Arbitrum & Polygon
 * Supports both Uniswap V3 swaps and Stargate bridges
 *
 * Chains: Arbitrum (42161), Polygon (137)
 * Tokens: USDT (Tether, supports EIP-2612), ETH/WETH
 *
 * NOTE: USDT supports EIP-2612 permits for gasless transactions
 * Stargate Asset ID for USDT: 2
 */

// ============================================================================
// Chain Constants
// ============================================================================

export const SUPPORTED_CHAINS = {
  ARBITRUM: 42161,
  POLYGON: 137,
} as const;

export type SupportedChainId = typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS];

// ============================================================================
// Uniswap V3 Addresses
// ============================================================================

export const UNISWAP_ROUTER_ADDRESS: Record<SupportedChainId, `0x${string}`> = {
  [SUPPORTED_CHAINS.ARBITRUM]: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // SwapRouter02
  [SUPPORTED_CHAINS.POLYGON]: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // SwapRouter02
} as const;

export const UNISWAP_QUOTER_ADDRESS: Record<SupportedChainId, `0x${string}`> = {
  [SUPPORTED_CHAINS.ARBITRUM]: '0x31d6197b846032ed9fc0aa368c91b845c70da5f8', // QuoterV2
  [SUPPORTED_CHAINS.POLYGON]: '0x27F6D29F78C752a5cd5fD67142c79Ffa7118849e', // QuoterV2
} as const;

export const UNISWAP_FACTORY_ADDRESS: Record<SupportedChainId, `0x${string}`> = {
  [SUPPORTED_CHAINS.ARBITRUM]: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  [SUPPORTED_CHAINS.POLYGON]: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
} as const;

// ============================================================================
// Stargate Addresses
// ============================================================================

// Stargate Router (same address on all chains)
export const STARGATE_ROUTER_ADDRESS: `0x${string}` = '0x8731d54E9D02c286767d56ac03e8037C07e01e98' as const;

// Stargate USDT Pool IDs (Asset ID: 2)
export const STARGATE_USDT_POOL_ID: Record<SupportedChainId, number> = {
  [SUPPORTED_CHAINS.ARBITRUM]: 2,  // USDT pool on Arbitrum
  [SUPPORTED_CHAINS.POLYGON]: 2,   // USDT pool on Polygon
} as const;

// LayerZero Chain IDs for Stargate
export const LAYER_ZERO_CHAIN_ID: Record<SupportedChainId, number> = {
  [SUPPORTED_CHAINS.ARBITRUM]: 110,
  [SUPPORTED_CHAINS.POLYGON]: 109,
} as const;

// ============================================================================
// Token Configuration
// ============================================================================

export interface TokenConfig {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  chainId: SupportedChainId;
}

// Arbitrum Tokens
const ARBITRUM_TOKENS: TokenConfig[] = [
  {
    symbol: 'USDT',
    name: 'Tether USD',
    // USDT on Arbitrum (supports EIP-2612 permit)
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    decimals: 6,
    chainId: SUPPORTED_CHAINS.ARBITRUM,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    // WETH on Arbitrum
    address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    decimals: 18,
    chainId: SUPPORTED_CHAINS.ARBITRUM,
  },
];

// Polygon Tokens
const POLYGON_TOKENS: TokenConfig[] = [
  {
    symbol: 'USDT',
    name: 'Tether USD',
    // USDT on Polygon (supports EIP-2612 permit)
    address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    decimals: 6,
    chainId: SUPPORTED_CHAINS.POLYGON,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    // Wrapped ETH on Polygon
    address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    decimals: 18,
    chainId: SUPPORTED_CHAINS.POLYGON,
  },
];

// ============================================================================
// Token Lists by Chain
// ============================================================================

export const TOKENS_BY_CHAIN: Record<SupportedChainId, TokenConfig[]> = {
  [SUPPORTED_CHAINS.ARBITRUM]: ARBITRUM_TOKENS,
  [SUPPORTED_CHAINS.POLYGON]: POLYGON_TOKENS,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get USDT config for a chain
 */
export function getUSDTConfig(chainId: SupportedChainId): TokenConfig {
  const config = TOKENS_BY_CHAIN[chainId].find(t => t.symbol === 'USDT');
  if (!config) throw new Error(`USDT not found for chain ${chainId}`);
  return config;
}

/**
 * Get ETH config for a chain
 */
export function getETHConfig(chainId: SupportedChainId): TokenConfig {
  const config = TOKENS_BY_CHAIN[chainId].find(t => t.symbol === 'ETH');
  if (!config) throw new Error(`ETH not found for chain ${chainId}`);
  return config;
}

/**
 * Get all tokens for a chain
 */
export function getTokensForChain(chainId: SupportedChainId): TokenConfig[] {
  return TOKENS_BY_CHAIN[chainId];
}

/**
 * Get token config by symbol and chainId
 */
export function getTokenConfig(
  symbol: string,
  chainId: SupportedChainId
): TokenConfig | undefined {
  return TOKENS_BY_CHAIN[chainId].find(t => t.symbol === symbol);
}

/**
 * Get chain name
 */
export function getChainName(chainId: SupportedChainId): string {
  const names: Record<SupportedChainId, string> = {
    [SUPPORTED_CHAINS.ARBITRUM]: 'Arbitrum',
    [SUPPORTED_CHAINS.POLYGON]: 'Polygon',
  };
  return names[chainId];
}

/**
 * Get explorer URL for a chain
 */
export function getExplorerUrl(chainId: SupportedChainId): string {
  const explorers: Record<SupportedChainId, string> = {
    [SUPPORTED_CHAINS.ARBITRUM]: 'https://arbiscan.io',
    [SUPPORTED_CHAINS.POLYGON]: 'https://polygonscan.com',
  };
  return explorers[chainId];
}

/**
 * Get destination chain (the other chain)
 */
export function getDestinationChainId(sourceChainId: SupportedChainId): SupportedChainId {
  return sourceChainId === SUPPORTED_CHAINS.ARBITRUM
    ? SUPPORTED_CHAINS.POLYGON
    : SUPPORTED_CHAINS.ARBITRUM;
}

/**
 * Get Uniswap router address for chain
 */
export function getUniswapRouterAddress(chainId: SupportedChainId): `0x${string}` {
  return UNISWAP_ROUTER_ADDRESS[chainId];
}

/**
 * Get Uniswap quoter address for chain
 */
export function getUniswapQuoterAddress(chainId: SupportedChainId): `0x${string}` {
  return UNISWAP_QUOTER_ADDRESS[chainId];
}

/**
 * Get Uniswap factory address for chain
 */
export function getUniswapFactoryAddress(chainId: SupportedChainId): `0x${string}` {
  return UNISWAP_FACTORY_ADDRESS[chainId];
}
