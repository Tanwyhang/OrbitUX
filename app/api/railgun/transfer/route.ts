/**
 * POST /api/railgun/transfer
 * 
 * Execute a complete private transfer with FULL gas abstraction.
 * 
 * Supports both:
 * - Legacy single-recipient format (recipientAddress, tokenAddress, amount)
 * - New batch format (recipients array with per-token permits)
 * 
 * Uses Server-Sent Events (SSE) to stream real-time progress updates.
 * 
 * Flow:
 * 1. If permit data provided: Relayer calls permit() on-chain (user pays no gas)
 * 2. Shield (sender public → sender private) - one TX per token
 * 3. Wait for POI verification (~60s)
 * 4. Generate ZK proof (one per recipient due to SDK limitation)
 * 5. Unshield (sender private → recipients public) - one TX per recipient
 * 
 * Gas sponsorship: Server-side relayer pays ALL gas costs.
 * User only signs gasless permit messages - they pay ZERO gas.
 */

import { NextRequest } from "next/server";
import { railgunEngine } from "@/lib/railgun/engine";
import { railgunTransfer } from "@/lib/railgun/transfer";
import { relayerService } from "@/lib/railgun/relayer";
import type { TransferRequest, TransferProgress, TransferRecipientInput, PermitData } from "@/lib/railgun/types";

export const maxDuration = 300; // Allow up to 5 minutes for full flow

/**
 * Normalize request to batch format
 * Converts legacy single-recipient requests to batch format
 */
function normalizeRequest(body: TransferRequest): {
  recipients: TransferRecipientInput[];
  permits: Record<string, PermitData>;
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
    const permits: Record<string, PermitData> = {};
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

/**
 * SSE event types
 */
type SSEEventType = 'progress' | 'complete' | 'error';

interface SSEProgressEvent {
  type: 'progress';
  data: TransferProgress;
}

interface SSECompleteEvent {
  type: 'complete';
  data: {
    success: true;
    shieldResults?: Array<{
      tokenAddress: string;
      amount: string;
      shieldTxHash: string;
      status: string;
    }>;
    unshieldTxHash?: string;
    recipientResults?: Array<{
      address: string;
      amount: string;
      status: string;
      unshieldTxHash?: string;
      error?: string;
    }>;
    senderRailgunAddress?: string;
    shieldTxHash?: string;
  };
}

interface SSEErrorEvent {
  type: 'error';
  data: {
    success: false;
    error: string;
    shieldResults?: Array<{
      tokenAddress: string;
      amount: string;
      shieldTxHash: string;
      status: string;
    }>;
    recipientResults?: Array<{
      address: string;
      amount: string;
      status: string;
      unshieldTxHash?: string;
      error?: string;
    }>;
  };
}

type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent;

export async function POST(request: NextRequest): Promise<Response> {
  // Parse and validate request first (before setting up stream)
  let body: TransferRequest;
  let normalized: { recipients: TransferRecipientInput[]; permits: Record<string, PermitData>; isLegacy: boolean };
  
  try {
    body = await request.json() as TransferRequest;
    
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
      return new Response(JSON.stringify({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    normalized = normalizeRequest(body);
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : 'Invalid request format',
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { recipients, permits, isLegacy } = normalized;

  // Validate gas abstraction method
  if (body.gasAbstraction === 'permit') {
    const tokenAddresses = [...new Set(recipients.map(r => r.tokenAddress))];
    const missingPermits = tokenAddresses.filter(t => !permits[t]);
    if (missingPermits.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `Missing permits for tokens: ${missingPermits.join(', ')}`,
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (body.gasAbstraction === 'eip7702' && !body.eip7702Auth) {
    return new Response(JSON.stringify({
      success: false,
      error: 'EIP-7702 authorization required for 7702 gas abstraction',
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check relayer is configured
  if (!relayerService.isConfigured()) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Server relayer not configured. Contact administrator.',
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Ensure engine is ready
  if (!railgunEngine.isReady()) {
    console.log('[API] Engine not ready, initializing...');
    await railgunEngine.initialize();
  }

  console.log('[API] POST /api/railgun/transfer - Starting gasless transfer flow with SSE...');
  console.log('[API] Format:', isLegacy ? 'legacy single-recipient' : 'batch multi-recipient');
  console.log('[API] Recipients:', recipients.length);
  console.log('[API] Unique tokens:', [...new Set(recipients.map(r => r.tokenAddress))].length);
  console.log('[API] User Address:', body.userAddress);
  console.log('[API] Gas Abstraction:', body.gasAbstraction);
  console.log('[API] Sender RAILGUN:', body.senderRailgunAddress.slice(0, 20) + '...');
  console.log('[API] Relayer:', relayerService.getAddress());

  // Create SSE stream
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE events
      const sendEvent = (event: SSEEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      try {
        // Execute batch transfer with progress streaming
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
            sendEvent({
              type: 'progress',
              data: progress,
            });
          },
        });

        if (result.success) {
          sendEvent({
            type: 'complete',
            data: {
              success: true,
              shieldResults: result.shieldResults,
              unshieldTxHash: result.unshieldTxHash,
              recipientResults: result.recipientResults,
              senderRailgunAddress: result.senderRailgunAddress,
              shieldTxHash: result.shieldTxHash,
            },
          });
        } else {
          sendEvent({
            type: 'error',
            data: {
              success: false,
              error: result.error || 'Transfer failed',
              shieldResults: result.shieldResults,
              recipientResults: result.recipientResults,
            },
          });
        }
      } catch (error) {
        console.error('[API] Transfer failed:', error);
        sendEvent({
          type: 'error',
          data: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
