/**
 * POST /api/swap/private
 * 
 * Execute a private swap via RAILGUN with SSE streaming progress.
 * 
 * Flow:
 * 1. Permit execution (relayer pays gas)
 * 2. Shield input tokens
 * 3. Wait for POI
 * 4. Generate ZK proof
 * 5. Unshield to relayer
 * 6. Execute swap on pool
 * 7. Output goes directly to user
 * 
 * Returns: Server-Sent Events stream with progress updates
 */

import { NextRequest } from 'next/server';
import { railgunEngine } from '@/lib/railgun/engine';
import { relayerService } from '@/lib/railgun/relayer';
import { privateSwapService } from '@/lib/swap/privateSwapService';
import type { PrivateSwapRequest, PrivateSwapProgress } from '@/lib/swap/privateSwapTypes';

export const maxDuration = 300; // 5 minutes max for full flow

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PrivateSwapRequest;

    // Validate required fields
    const required = [
      'senderWalletID',
      'senderEncryptionKey',
      'senderRailgunAddress',
      'userAddress',
      'inputTokenAddress',
      'outputTokenAddress',
      'inputAmount',
      'minimumOutput',
      'poolAddress',
      'inputTokenDecimals',
      'outputTokenDecimals',
    ];

    const missing = required.filter(field => !body[field as keyof PrivateSwapRequest]);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check relayer is configured
    if (!relayerService.isConfigured()) {
      return new Response(
        JSON.stringify({ error: 'Server relayer not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Ensure engine is ready
    if (!railgunEngine.isReady()) {
      console.log('[API] Engine not ready, initializing...');
      await railgunEngine.initialize();
    }

    console.log('[API] POST /api/swap/private - Starting private swap...');
    console.log('[API] Input token:', body.inputTokenAddress);
    console.log('[API] Output token:', body.outputTokenAddress);
    console.log('[API] Pool:', body.poolAddress);

    // Create SSE stream
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream progress updates
          for await (const progress of privateSwapService.executePrivateSwapStream(body)) {
            const data = `data: ${JSON.stringify(progress)}\n\n`;
            controller.enqueue(encoder.encode(data));
            
            // If complete or error, we're done
            if (progress.step === 'complete' || progress.step === 'error') {
              break;
            }
          }
        } catch (error) {
          console.error('[API] Private swap stream error:', error);
          const errorProgress: PrivateSwapProgress = {
            step: 'error',
            progress: 0,
            message: error instanceof Error ? error.message : 'Unknown error',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorProgress)}\n\n`));
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

  } catch (error) {
    console.error('[API] Private swap failed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
