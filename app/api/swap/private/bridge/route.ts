/**
 * POST /api/swap/private/bridge
 *
 * Execute a private cross-chain bridge via RAILGUN + Stargate
 * with SSE streaming progress.
 *
 * Flow:
 * 1. Source chain: shield → POI → ZK proof → unshield to relayer
 * 2. Cross-chain: relayer executes Stargate bridge
 * 3. Destination chain: shield tokens to private balance
 *
 * Returns: Server-Sent Events stream with progress updates
 */

import { NextRequest } from 'next/server';
import { relayerService } from '@/lib/railgun/relayer';
import { privateBridgeService } from '@/lib/swap/bridge/privateBridgeService';
import { StargateBridgeAdapter } from '@/lib/swap/bridge/adapters/StargateBridgeAdapter';
import type { PrivateBridgeProgress, PrivateBridgeRequest } from '@/lib/swap/privateBridgeTypes';

export const maxDuration = 600; // 10 minutes max for cross-chain

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PrivateBridgeRequest;

    // Validate required fields
    const required = [
      'senderWalletID',
      'senderEncryptionKey',
      'senderRailgunAddress',
      'userAddress',
      'sourceChainId',
      'destinationChainId',
      'inputTokenAddress',
      'inputAmount',
      'inputTokenDecimals',
      'mode',
      'destinationDelivery',
      'slippage',
    ];

    const missing = required.filter(field => !body[field as keyof PrivateBridgeRequest]);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Set relayer chain ID to match source chain
    relayerService.setChainId(body.sourceChainId);

    // Check relayer
    if (!relayerService.isConfigured()) {
      return new Response(
        JSON.stringify({ error: 'Server relayer not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[API] POST /api/swap/private/bridge - Starting private bridge...');
    console.log('[API] Source:', body.sourceChainId, 'Destination:', body.destinationChainId);
    console.log('[API] Mode:', body.mode, 'Delivery:', body.destinationDelivery);

    // Create bridge adapter
    const bridgeAdapter = new StargateBridgeAdapter();

    // Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const bridgeGenerator = privateBridgeService.executePrivateBridgeStream({
            ...body,
            bridgeAdapter,
          });

          for await (const progress of bridgeGenerator) {
            const data = `data: ${JSON.stringify(progress)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }

        } catch (error) {
          console.error('[API] Private bridge stream error:', error);
          const errorProgress: PrivateBridgeProgress = {
            step: 'error',
            progress: 0,
            message: error instanceof Error ? error.message : 'Unknown error',
            sourceChainId: body.sourceChainId,
            destinationChainId: body.destinationChainId,
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
    console.error('[API] Private bridge failed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
