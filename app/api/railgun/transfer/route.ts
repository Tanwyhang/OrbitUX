/**
 * POST /api/railgun/transfer
 * 
 * Execute a complete private transfer with FULL gas abstraction:
 * 1. If permit data provided: Relayer calls permit() on-chain (user pays no gas)
 * 2. Shield (sender public → sender private) - relayer pays gas
 * 3. Wait for POI verification (~60s)
 * 4. Generate ZK proof
 * 5. Unshield (sender private → recipient public) - relayer pays gas
 * 
 * Gas sponsorship: Server-side relayer pays ALL gas costs.
 * User only signs a gasless permit message - they pay ZERO gas.
 */

import { NextRequest, NextResponse } from "next/server";
import { railgunEngine } from "@/lib/railgun/engine";
import { railgunTransfer } from "@/lib/railgun/transfer";
import { relayerService } from "@/lib/railgun/relayer";
import type { TransferRequest, TransferResponse, TransferProgress } from "@/lib/railgun/types";

export const maxDuration = 300; // Allow up to 5 minutes for full flow

export async function POST(request: NextRequest): Promise<NextResponse<TransferResponse>> {
  try {
    const body = await request.json() as TransferRequest;
    
    // Validate required fields
    const required = [
      'senderWalletID', 
      'senderEncryptionKey', 
      'senderRailgunAddress',
      'recipientAddress', 
      'tokenAddress', 
      'amount', 
      'userAddress',
      'gasAbstraction'
    ];
    const missing = required.filter(field => !body[field as keyof TransferRequest]);
    
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      }, { status: 400 });
    }

    // Validate gas abstraction method
    if (body.gasAbstraction === 'permit' && !body.permitData) {
      return NextResponse.json({
        success: false,
        error: 'Permit data required for permit-based gas abstraction',
      }, { status: 400 });
    }

    if (body.gasAbstraction === 'eip7702' && !body.eip7702Auth) {
      return NextResponse.json({
        success: false,
        error: 'EIP-7702 authorization required for 7702 gas abstraction',
      }, { status: 400 });
    }

    // Check relayer is configured
    if (!relayerService.isConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Server relayer not configured. Contact administrator.',
      }, { status: 500 });
    }

    // Ensure engine is ready
    if (!railgunEngine.isReady()) {
      console.log('[API] Engine not ready, initializing...');
      await railgunEngine.initialize();
    }

    console.log('[API] POST /api/railgun/transfer - Starting gasless transfer flow...');
    console.log('[API] Amount:', body.amount);
    console.log('[API] Token:', body.tokenAddress);
    console.log('[API] User Address:', body.userAddress);
    console.log('[API] Gas Abstraction:', body.gasAbstraction);
    console.log('[API] Sender RAILGUN:', body.senderRailgunAddress.slice(0, 20) + '...');
    console.log('[API] Recipient Public:', body.recipientAddress);
    console.log('[API] Relayer:', relayerService.getAddress());

    // Collect progress updates (for logging)
    const progressUpdates: TransferProgress[] = [];
    
    const result = await railgunTransfer.executeTransfer({
      senderWalletID: body.senderWalletID,
      senderEncryptionKey: body.senderEncryptionKey,
      senderRailgunAddress: body.senderRailgunAddress,
      recipientPublicAddress: body.recipientAddress,
      tokenAddress: body.tokenAddress,
      amount: BigInt(body.amount),
      userAddress: body.userAddress,
      gasAbstraction: body.gasAbstraction,
      permitData: body.permitData,
      eip7702Auth: body.eip7702Auth,
      onProgress: (progress) => {
        console.log(`[API Transfer] ${progress.step}: ${progress.message} (${progress.progress}%)`);
        progressUpdates.push(progress);
      },
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        shieldTxHash: result.shieldTxHash,
        unshieldTxHash: result.unshieldTxHash,
        senderRailgunAddress: result.senderRailgunAddress,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[API] Transfer failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
