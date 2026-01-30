/**
 * POST /api/railgun/transfer
 * 
 * Execute a complete private transfer:
 * Sender Public → Shield → Private → Unshield → Recipient Public
 * 
 * This endpoint performs a synchronous transfer and returns when complete.
 * The full flow can take 2-3 minutes due to POI verification and ZK proof generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { railgunEngine } from "@/lib/railgun/engine";
import { railgunTransfer } from "@/lib/railgun/transfer";
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
      'signerPrivateKey'
    ];
    const missing = required.filter(field => !body[field as keyof TransferRequest]);
    
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      }, { status: 400 });
    }

    // Ensure engine is ready
    if (!railgunEngine.isReady()) {
      console.log('[API] Engine not ready, initializing...');
      await railgunEngine.initialize();
    }

    console.log('[API] POST /api/railgun/transfer - Starting complete transfer flow...');
    console.log('[API] Amount:', body.amount);
    console.log('[API] Token:', body.tokenAddress);
    console.log('[API] Sender RAILGUN:', body.senderRailgunAddress.slice(0, 20) + '...');
    console.log('[API] Recipient Public:', body.recipientAddress);

    // Collect progress updates (for logging)
    const progressUpdates: TransferProgress[] = [];
    
    const result = await railgunTransfer.executeTransfer({
      senderWalletID: body.senderWalletID,
      senderEncryptionKey: body.senderEncryptionKey,
      senderRailgunAddress: body.senderRailgunAddress,
      recipientPublicAddress: body.recipientAddress,
      tokenAddress: body.tokenAddress,
      amount: BigInt(body.amount),
      signerPrivateKey: body.signerPrivateKey,
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
