/**
 * GET /api/railgun/stablecoins
 * 
 * Returns a list of supported stablecoins for the zkWormhole.
 * These are the tokens that can be used for private transfers on Sepolia.
 */

import { NextResponse } from "next/server";

export interface Stablecoin {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
}

export interface StablecoinsResponse {
  success: boolean;
  stablecoins: Stablecoin[];
  network: string;
  error?: string;
}

// Supported stablecoins on Sepolia testnet
// In production, this could be fetched from an external API or database
const SUPPORTED_STABLECOINS: Stablecoin[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    decimals: 6,
    logoUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    decimals: 6,
    logoUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6',
    decimals: 18,
    logoUrl: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.svg',
  },
];

export async function GET(): Promise<NextResponse<StablecoinsResponse>> {
  try {
    return NextResponse.json({
      success: true,
      stablecoins: SUPPORTED_STABLECOINS,
      network: 'sepolia',
    });
  } catch (error) {
    console.error('[API] Failed to fetch stablecoins:', error);
    
    return NextResponse.json({
      success: false,
      stablecoins: [],
      network: 'sepolia',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
