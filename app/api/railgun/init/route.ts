/**
 * POST /api/railgun/init
 * 
 * Initialize the RAILGUN engine. Must be called before any other operations.
 */

import { NextRequest, NextResponse } from "next/server";
import { railgunEngine } from "@/lib/railgun/engine";
import type { EngineStatusResponse } from "@/lib/railgun/types";

export async function POST(request: NextRequest): Promise<NextResponse<EngineStatusResponse>> {
  try {
    console.log('[API] POST /api/railgun/init - Initializing engine...');
    
    await railgunEngine.initialize();
    
    const status = railgunEngine.getStatus();
    
    return NextResponse.json({
      status: status.status,
      error: status.error,
      network: railgunEngine.getNetwork(),
    });
  } catch (error) {
    console.error('[API] Engine initialization failed:', error);
    
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      network: railgunEngine.getNetwork(),
    }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse<EngineStatusResponse>> {
  const status = railgunEngine.getStatus();
  
  return NextResponse.json({
    status: status.status,
    error: status.error,
    network: railgunEngine.getNetwork(),
  });
}
