/**
 * GET /api/railgun/balance
 * 
 * Get the private balance for a RAILGUN wallet.
 * 
 * Query params:
 * - walletID: The wallet ID to check
 * - tokenAddress: The token address to check balance for
 */

import { NextRequest, NextResponse } from "next/server";
import { NetworkName, TXIDVersion, NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG } from "@railgun-community/shared-models";
import { refreshBalances, balanceForERC20Token, walletForID } from "@railgun-community/wallet";
import { railgunEngine } from "@/lib/railgun/engine";
import type { BalanceResponse } from "@/lib/railgun/types";

export async function GET(request: NextRequest): Promise<NextResponse<BalanceResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const walletID = searchParams.get('walletID');
    const tokenAddress = searchParams.get('tokenAddress');

    if (!walletID || !tokenAddress) {
      return NextResponse.json({
        success: false,
        spendable: '0',
        total: '0',
        tokenAddress: tokenAddress ?? '',
        error: 'Missing required query params: walletID, tokenAddress',
      }, { status: 400 });
    }

    // Ensure engine is ready
    if (!railgunEngine.isReady()) {
      return NextResponse.json({
        success: false,
        spendable: '0',
        total: '0',
        tokenAddress,
        error: 'RAILGUN engine not initialized',
      }, { status: 503 });
    }

    console.log('[API] GET /api/railgun/balance - Fetching balance...');
    
    const networkName = railgunEngine.getNetwork();
    const txidVersion = railgunEngine.getTxidVersion();
    const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

    // Refresh balances from chain
    await refreshBalances(chain, [walletID]);

    // Get wallet instance
    const abstractWallet = walletForID(walletID);
    
    // Get spendable balance (excludes unspent notes)
    const spendableBalance = await balanceForERC20Token(
      txidVersion,
      abstractWallet,
      networkName,
      tokenAddress,
      true // onlySpendable
    );

    // Get total balance (includes pending/unspent notes)
    const totalBalance = await balanceForERC20Token(
      txidVersion,
      abstractWallet,
      networkName,
      tokenAddress,
      false // onlySpendable
    );

    console.log(`[API] Balance - Spendable: ${spendableBalance}, Total: ${totalBalance}`);

    return NextResponse.json({
      success: true,
      spendable: spendableBalance.toString(),
      total: totalBalance.toString(),
      tokenAddress,
    });
  } catch (error) {
    console.error('[API] Balance fetch failed:', error);
    
    const { searchParams } = new URL(request.url);
    const tokenAddress = searchParams.get('tokenAddress') ?? '';

    return NextResponse.json({
      success: false,
      spendable: '0',
      total: '0',
      tokenAddress,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
