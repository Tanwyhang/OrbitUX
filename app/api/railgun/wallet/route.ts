/**
 * POST /api/railgun/wallet
 * 
 * Create or restore a RAILGUN wallet from a mnemonic.
 */

import { NextRequest, NextResponse } from "next/server";
import { railgunEngine } from "@/lib/railgun/engine";
import { railgunWallet } from "@/lib/railgun/wallet";
import type { WalletCreateRequest, WalletCreateResponse } from "@/lib/railgun/types";

export async function POST(request: NextRequest): Promise<NextResponse<WalletCreateResponse>> {
  try {
    const body = await request.json() as WalletCreateRequest;
    
    if (!body.mnemonic || !body.password) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: mnemonic, password',
      }, { status: 400 });
    }

    // Ensure engine is ready
    if (!railgunEngine.isReady()) {
      console.log('[API] Engine not ready, initializing...');
      await railgunEngine.initialize();
    }

    console.log('[API] POST /api/railgun/wallet - Creating wallet...');
    
    const walletInfo = await railgunWallet.createWalletFromMnemonic(
      body.mnemonic,
      body.password
    );
    
    return NextResponse.json({
      success: true,
      walletID: walletInfo.walletID,
      railgunAddress: walletInfo.railgunAddress,
    });
  } catch (error) {
    console.error('[API] Wallet creation failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
