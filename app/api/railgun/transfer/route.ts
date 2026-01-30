/**
 * POST /api/railgun/transfer
 * 
 * Execute a complete private transfer with FULL gas abstraction.
 * 
 * Supports both:
 * - Legacy single-recipient format (recipientAddress, tokenAddress, amount)
 * - New batch format (recipients array with per-token permits)
 * 
 * Flow:
 * 1. If permit data provided: Relayer calls permit() on-chain (user pays no gas)
 * 2. Shield (sender public → sender private) - one TX per token
 * 3. Wait for POI verification (~60s)
 * 4. Generate ZK proof (single proof for all recipients)
 * 5. Unshield (sender private → recipients public) - single TX
 * 
 * Gas sponsorship: Server-side relayer pays ALL gas costs.
 * User only signs gasless permit messages - they pay ZERO gas.
 */

import { NextRequest, NextResponse } from "next/server";
import { railgunEngine } from "@/lib/railgun/engine";
import { railgunTransfer } from "@/lib/railgun/transfer";
import { relayerService } from "@/lib/railgun/relayer";
import type { TransferRequest, TransferResponse, TransferProgress, TransferRecipientInput } from "@/lib/railgun/types";

export const maxDuration = 300; // Allow up to 5 minutes for full flow

/**
 * Normalize request to batch format
 * Converts legacy single-recipient requests to batch format
 */
function normalizeRequest(body: TransferRequest): {
  recipients: TransferRecipientInput[];
  permits: Record<string, import("@/lib/railgun/types").PermitData>;
  isLegacy: boolean;
} {
  // New batch format: has recipients array
  if (body.recipients && body.recipients.length > 0) {
    return {
      recipients: body.recipients,
      permits: body.permits || {},
      isLegacy: false,
    };
  }

  // Legacy format: single recipient
  if (body.recipientAddress && body.tokenAddress && body.amount) {
    const permits: Record<string, import("@/lib/railgun/types").PermitData> = {};
    if (body.permitData) {
      permits[body.tokenAddress] = body.permitData;
    }

    return {
      recipients: [{
        address: body.recipientAddress,
        tokenAddress: body.tokenAddress,
        amount: body.amount,
      }],
      permits,
      isLegacy: true,
    };
  }

  throw new Error('Invalid request: must provide either recipients array or recipientAddress/tokenAddress/amount');
}

export async function POST(request: NextRequest): Promise<NextResponse<TransferResponse>> {
  try {
    const body = await request.json() as TransferRequest;
    
    // Validate core required fields
    const coreRequired = [
      'senderWalletID', 
      'senderEncryptionKey', 
      'senderRailgunAddress',
      'userAddress',
      'gasAbstraction'
    ];
    const missing = coreRequired.filter(field => !body[field as keyof TransferRequest]);
    
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      }, { status: 400 });
    }

    // Normalize to batch format
    let normalized;
    try {
      normalized = normalizeRequest(body);
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: e instanceof Error ? e.message : 'Invalid request format',
      }, { status: 400 });
    }

    const { recipients, permits, isLegacy } = normalized;

    // Validate gas abstraction method
    if (body.gasAbstraction === 'permit') {
      // Check we have permits for all tokens
      const tokenAddresses = [...new Set(recipients.map(r => r.tokenAddress))];
      const missingPermits = tokenAddresses.filter(t => !permits[t]);
      if (missingPermits.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Missing permits for tokens: ${missingPermits.join(', ')}`,
        }, { status: 400 });
      }
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
    console.log('[API] Format:', isLegacy ? 'legacy single-recipient' : 'batch multi-recipient');
    console.log('[API] Recipients:', recipients.length);
    console.log('[API] Unique tokens:', [...new Set(recipients.map(r => r.tokenAddress))].length);
    console.log('[API] User Address:', body.userAddress);
    console.log('[API] Gas Abstraction:', body.gasAbstraction);
    console.log('[API] Sender RAILGUN:', body.senderRailgunAddress.slice(0, 20) + '...');
    console.log('[API] Relayer:', relayerService.getAddress());

    // Collect progress updates (for logging)
    const progressUpdates: TransferProgress[] = [];
    
    // Use batch transfer for all requests (handles single recipient too)
    const result = await railgunTransfer.executeBatchTransfer({
      senderWalletID: body.senderWalletID,
      senderEncryptionKey: body.senderEncryptionKey,
      senderRailgunAddress: body.senderRailgunAddress,
      userAddress: body.userAddress,
      recipients,
      permits,
      gasAbstraction: body.gasAbstraction,
      eip7702Auth: body.eip7702Auth,
      onProgress: (progress) => {
        console.log(`[API Transfer] ${progress.step}: ${progress.message} (${progress.progress}%)`);
        progressUpdates.push(progress);
      },
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        shieldResults: result.shieldResults,
        unshieldTxHash: result.unshieldTxHash,
        recipientResults: result.recipientResults,
        senderRailgunAddress: result.senderRailgunAddress,
        // Legacy compat
        shieldTxHash: result.shieldTxHash,
      });
    } else {
      return NextResponse.json({
        success: false,
        shieldResults: result.shieldResults,
        recipientResults: result.recipientResults,
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
