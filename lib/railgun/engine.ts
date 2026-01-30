/**
 * Server-side RAILGUN Engine Service
 * 
 * This module manages the RAILGUN engine singleton for use in API routes.
 * It wraps the @railgun-community/wallet SDK for server-side usage.
 */

import { 
  NetworkName, 
  TXIDVersion, 
  FallbackProviderJsonConfig,
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG
} from "@railgun-community/shared-models";
import {
  startRailgunEngine,
  stopRailgunEngine,
  getProver,
  loadProvider,
  SnarkJSGroth16,
  ArtifactStore
} from "@railgun-community/wallet";
import { groth16 } from "snarkjs";
import fs from "fs";
import path from "path";
import leveldown from "leveldown";
import type { AbstractLevelDOWN } from 'abstract-leveldown';

// Configuration
const NETWORK_NAME = NetworkName.EthereumSepolia;
const RPC_URL = process.env.RAILGUN_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/lO9FWaEPl-y8mMJHInELW";
const POI_NODES = ["https://ppoi-agg.horsewithsixlegs.xyz"];

export type EngineStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

interface EngineState {
  status: EngineStatus;
  error: string | null;
}

class RailgunEngineService {
  private static instance: RailgunEngineService | null = null;
  private state: EngineState = { status: 'uninitialized', error: null };
  private db: AbstractLevelDOWN | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): RailgunEngineService {
    if (!RailgunEngineService.instance) {
      RailgunEngineService.instance = new RailgunEngineService();
    }
    return RailgunEngineService.instance;
  }

  getStatus(): EngineState {
    return { ...this.state };
  }

  async initialize(): Promise<void> {
    // If already ready, return immediately
    if (this.state.status === 'ready') {
      return;
    }

    // If already initializing, wait for that to complete
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    this.state = { status: 'initializing', error: null };

    try {
      console.log('[RAILGUN Engine] Initializing...');

      // Setup artifact store
      const artifactsDir = path.join(process.cwd(), "artifacts");
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }

      const artifactStore = new ArtifactStore(
        async (filePath: string) => {
          const fullPath = path.join(artifactsDir, filePath);
          return fs.promises.readFile(fullPath);
        },
        async (dir: string, filePath: string, item: string | Uint8Array) => {
          const fullPath = path.join(artifactsDir, filePath);
          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
          return fs.promises.writeFile(fullPath, item);
        },
        async (filePath: string) => {
          return fs.existsSync(path.join(artifactsDir, filePath));
        },
      );

      // Setup database
      const dbPath = path.join(process.cwd(), "engine.db");
      this.db = leveldown(dbPath) as AbstractLevelDOWN;

      // Start engine
      await startRailgunEngine(
        "OrbitNeobank",
        this.db,
        false, // shouldDebug
        artifactStore,
        false, // useNativeArtifacts
        false, // skipMerkletreeScans
        POI_NODES
      );

      // Setup prover
      const snarkjsAdapter: SnarkJSGroth16 = {
        fullProve: async (formattedInputs: any, wasm: any, zkey: any, logger: any) => {
          return groth16.fullProve(formattedInputs, wasm, zkey, logger) as any;
        },
        verify: (vkey: any, publicSignals: any, proof: any) => {
          return groth16.verify(vkey, publicSignals, proof);
        },
      };
      getProver().setSnarkJSGroth16(snarkjsAdapter);

      // Load network provider
      const networkConfig = RAILGUN_NETWORK_CONFIG[NETWORK_NAME];
      const providerConfig: FallbackProviderJsonConfig = {
        chainId: networkConfig.chain.id,
        providers: [
          {
            provider: RPC_URL,
            priority: 3,
            weight: 2,
            maxLogsPerBatch: 1,
          },
        ],
      };

      await loadProvider(providerConfig, NETWORK_NAME, 1000 * 60 * 5);

      this.state = { status: 'ready', error: null };
      console.log('[RAILGUN Engine] Initialized successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.state = { status: 'error', error: errorMessage };
      console.error('[RAILGUN Engine] Initialization failed:', error);
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  async shutdown(): Promise<void> {
    if (this.state.status !== 'ready') {
      return;
    }

    try {
      await stopRailgunEngine();
      this.state = { status: 'uninitialized', error: null };
      console.log('[RAILGUN Engine] Shutdown successfully');
    } catch (error) {
      console.error('[RAILGUN Engine] Shutdown error:', error);
    }
  }

  isReady(): boolean {
    return this.state.status === 'ready';
  }

  getNetwork(): NetworkName {
    return NETWORK_NAME;
  }

  getTxidVersion(): TXIDVersion {
    return TXIDVersion.V2_PoseidonMerkle;
  }
}

export const railgunEngine = RailgunEngineService.getInstance();
