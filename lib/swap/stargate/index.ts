/**
 * Stargate Bridge Module
 * Simplified USDC bridging between Arbitrum and Polygon
 */

// Re-export types from this module
export * from './stargateTypes';
export * from './stargateAbi';
export * from './stargateBridgeService';

// Compose functionality (bridge + swap)
export * from './stargateComposeService';

// Note: Configuration is now in unifiedConfig to avoid duplication
