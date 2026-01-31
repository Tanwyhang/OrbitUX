/**
 * POST /api/swap/private/uniswap
 *
 * Execute a private swap via RAILGUN using Uniswap V3
 * with SSE streaming progress.
 *
 * This is the standardized private swap that uses:
 * - RAILGUN privacy layer (shield, POI, ZK proof, unshield)
 * - Uniswap V3 DEX adapter for swap execution
 *
 * Flow:
 * 1. Permit execution (relayer pays gas)
 * 2. Shield input tokens to RAILGUN
 * 3. Wait for POI (Proof of Innocence)
 * 4. Generate ZK proof
 * 5. Unshield to relayer
 * 6. Execute swap on Uniswap V3 (via adapter)
 * 7. Output goes directly to user
 *
 * Returns: Server-Sent Events stream with progress updates
 */

import { NextRequest } from 'next/server';
import { ethers, Contract } from 'ethers';
import { railgunEngine } from '@/lib/railgun/engine';
import { relayerService } from '@/lib/railgun/relayer';
import { standardizedPrivateSwapService } from '@/lib/swap/dex';
import { UniswapV3Adapter } from '@/lib/swap/dex';
import type { PrivateSwapProgress } from '@/lib/swap/privateSwapTypes';
import type { PermitData } from '@/lib/railgun/types';

export const maxDuration = 300; // 5 minutes max for full flow

interface UniswapPrivateSwapRequest {
  // RAILGUN wallet info
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;

  // Swap parameters
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputAmount: string;
  minimumOutput: string;
  poolAddress: string; // Will be ignored - determined by adapter
  inputTokenDecimals: number;
  outputTokenDecimals: number;

  // Permit for gasless approval
  permitData?: PermitData;

  // Uniswap-specific data
  uniswapData: {
    fee: number; // Fee tier (500, 3000, 10000)
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as UniswapPrivateSwapRequest;

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
      'inputTokenDecimals',
      'outputTokenDecimals',
      'uniswapData',
    ];

    const missing = required.filter(field => !body[field as keyof UniswapPrivateSwapRequest]);
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

    // Get relayer provider
    const relayerWallet = relayerService.getWallet();
    const provider = relayerService.getProvider();
    const chainId = Number((await provider.getNetwork()).chainId);

    console.log('[API] POST /api/swap/private/uniswap - Starting private swap...');
    console.log('[API] Input token:', body.inputTokenAddress);
    console.log('[API] Output token:', body.outputTokenAddress);
    console.log('[API] Chain:', chainId);
    console.log('[API] Fee tier:', body.uniswapData.fee);

    // Create Uniswap V3 adapter
    const dexAdapter = new UniswapV3Adapter(provider, chainId);

    // Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Execute private swap using standardized service
          // Note: inputAmount and minimumOutput are strings, will be converted to bigint inside the service
          const swapGenerator = standardizedPrivateSwapService.executePrivateSwapStream({
            senderWalletID: body.senderWalletID,
            senderEncryptionKey: body.senderEncryptionKey,
            senderRailgunAddress: body.senderRailgunAddress,
            userAddress: body.userAddress,
            inputTokenAddress: body.inputTokenAddress,
            outputTokenAddress: body.outputTokenAddress,
            inputAmount: body.inputAmount, // Keep as string, service will convert
            minimumOutput: body.minimumOutput, // Keep as string, service will convert
            poolAddress: body.poolAddress, // Required by PrivateSwapRequest type but not used by standardized service
            inputTokenDecimals: body.inputTokenDecimals,
            outputTokenDecimals: body.outputTokenDecimals,
            permitData: body.permitData,
            slippage: 0.5, // Default slippage - TODO: get from request
            dexAdapter,
            onProgress: (progress) => {
              const data = `data: ${JSON.stringify(progress)}\n\n`;
              controller.enqueue(encoder.encode(data));
            },
          });

          // Stream all progress updates
          for await (const progress of swapGenerator) {
            // The generator already calls onProgress, so we just need to yield
            // But the generator doesn't actually yield the progress, it sends via callback
            // So we wait for completion
          }

          // Note: The progress is sent via onProgress callback, so we don't need to do anything here
          // The stream will be closed when the swap completes

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
