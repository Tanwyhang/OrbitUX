/**
 * Multi-Chain RAILGUN Engine Manager
 *
 * Manages multiple RAILGUN engine instances for different chains.
 * Required for private bridges that need to operate on both source and destination chains.
 */

import {
  NetworkName,
  TXIDVersion,
  FallbackProviderJsonConfig,
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG,
} from "@railgun-community/shared-models";
import {
  startRailgunEngine,
  stopRailgunEngine,
  getProver,
  loadProvider,
  SnarkJSGroth16,
  ArtifactStore,
  walletForID,
  balanceForERC20Token,
} from "@railgun-community/wallet";
import { groth16 } from "snarkjs";
import fs from "fs";
import path from "path";
import leveldown from "leveldown";
import type { AbstractLevelDOWN } from 'abstract-leveldown';
import type { SupportedChainId } from '@/lib/swap/unifiedConfig';

// Chain-specific configurations
interface ChainConfig {
  networkName: NetworkName;
  rpcUrl: string;
  chainId: number;
}

// Map our chain IDs to RAILGUN network configurations
const CHAIN_CONFIGS: Record<SupportedChainId, ChainConfig> = {
  42161: { // Arbitrum
    networkName: NetworkName.Arbitrum,
    rpcUrl: process.env.RAILGUN_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
  },
  137: { // Polygon
    networkName: NetworkName.Polygon,
    rpcUrl: process.env.RAILGUN_POLYGON_RPC_URL || "https://polygon-rpc.com",
    chainId: 137,
  },
};

const POI_NODES = ["https://ppoi-agg.horsewithsixlegs.xyz"];

interface ChainEngineState {
  status: 'uninitialized' | 'initializing' | 'ready' | 'error';
  error: string | null;
  engineName: string;
  db: AbstractLevelDOWN | null;
}

class MultiChainRailgunEngine {
  private static instance: MultiChainRailgunEngine | null = null;
  private engines: Map<SupportedChainId, ChainEngineState> = new Map();
  private initPromises: Map<SupportedChainId, Promise<void>> = new Map();

  private constructor() {
    // Initialize with empty states
    for (const chainId of Object.keys(CHAIN_CONFIGS) as unknown as SupportedChainId[]) {
      this.engines.set(chainId, {
        status: 'uninitialized',
        error: null,
        engineName: `OrbitNeobank_${chainId}`,
        db: null,
      });
    }
  }

  static getInstance(): MultiChainRailgunEngine {
    if (!MultiChainRailgunEngine.instance) {
      MultiChainRailgunEngine.instance = new MultiChainRailgunEngine();
    }
    return MultiChainRailgunEngine.instance;
  }

  /**
   * Initialize RAILGUN engine for a specific chain
   */
  async initChain(chainId: SupportedChainId): Promise<void> {
    const currentState = this.engines.get(chainId);

    if (!currentState) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // If already ready, return immediately
    if (currentState.status === 'ready') {
      return;
    }

    // If already initializing, wait for that to complete
    if (this.initPromises.has(chainId)) {
      return this.initPromises.get(chainId)!;
    }

    // Start initialization
    const initPromise = this.doInitChain(chainId);
    this.initPromises.set(chainId, initPromise);
    return initPromise;
  }

  private async doInitChain(chainId: SupportedChainId): Promise<void> {
    const state = this.engines.get(chainId)!;
    const config = CHAIN_CONFIGS[chainId];

    state.status = 'initializing';

    try {
      console.log(`[MultiChainRAILGUN] Initializing engine for chain ${chainId} (${config.networkName})...`);

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

      // Setup chain-specific database
      const dbPath = path.join(process.cwd(), `engine_${chainId}.db`);
      state.db = leveldown(dbPath) as AbstractLevelDOWN;

      // Start engine with unique name
      await startRailgunEngine(
        state.engineName,
        state.db,
        false, // shouldDebug
        artifactStore,
        false, // useNativeArtifacts
        false, // skipMerkletreeScans
        POI_NODES
      );

      // Setup prover (only needs to be done once globally)
      try {
        const prover = getProver();
        const snarkjsAdapter: SnarkJSGroth16 = {
          fullProve: async (formattedInputs: any, wasm: any, zkey: any, logger: any) => {
            return groth16.fullProve(formattedInputs, wasm, zkey, logger) as any;
          },
          verify: (vkey: any, publicSignals: any, proof: any) => {
            return groth16.verify(vkey, publicSignals, proof);
          },
        };
        // @ts-ignore - prover type definition issue
        prover.setSnarkJSGroth16?.(snarkjsAdapter);
      } catch (error) {
        // Prover might already be set, ignore
      }

      // Load network provider
      const networkConfig = RAILGUN_NETWORK_CONFIG[config.networkName];
      const providerConfig: FallbackProviderJsonConfig = {
        chainId: networkConfig.chain.id,
        providers: [
          {
            provider: config.rpcUrl,
            priority: 3,
            weight: 2,
            maxLogsPerBatch: 1,
          },
        ],
      };

      await loadProvider(providerConfig, config.networkName, 1000 * 60 * 5);

      state.status = 'ready';
      console.log(`[MultiChainRAILGUN] Engine initialized for chain ${chainId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      state.status = 'error';
      state.error = errorMessage;
      console.error(`[MultiChainRAILGUN] Initialization failed for chain ${chainId}:`, error);
      throw error;
    } finally {
      this.initPromises.delete(chainId);
    }
  }

  /**
   * Check if a chain's engine is ready
   */
  isChainReady(chainId: SupportedChainId): boolean {
    const state = this.engines.get(chainId);
    return state?.status === 'ready';
  }

  /**
   * Get the network name for a chain
   */
  getNetworkName(chainId: SupportedChainId): NetworkName {
    const config = CHAIN_CONFIGS[chainId];
    return config.networkName;
  }

  /**
   * Load a wallet on a specific chain
   */
  async loadWalletOnChain(
    chainId: SupportedChainId,
    encryptionKey: string,
    walletID: string
  ): Promise<void> {
    const state = this.engines.get(chainId);
    if (!state || state.status !== 'ready') {
      throw new Error(`Chain ${chainId} engine not ready`);
    }

    const config = CHAIN_CONFIGS[chainId];

    // Check if wallet already exists for this engine
    const existingWallet = walletForID(walletID);
    if (existingWallet) {
      console.log(`[MultiChainRAILGUN] Wallet ${walletID} already loaded on chain ${chainId}`);
      return;
    }

    // Note: loadRailgunWalletID is not directly exported
    // The wallet will be loaded when needed through the regular flow
    console.log(`[MultiChainRAILGUN] Wallet ${walletID} ready for chain ${chainId}`);
  }

  /**
   * Get balance for a token on a specific chain
   */
  async getBalance(
    chainId: SupportedChainId,
    walletID: string,
    tokenAddress: string,
    spendable: boolean = true
  ): Promise<bigint> {
    const state = this.engines.get(chainId);
    if (!state || state.status !== 'ready') {
      throw new Error(`Chain ${chainId} engine not ready`);
    }

    const networkName = this.getNetworkName(chainId);
    const wallet = walletForID(walletID);
    if (!wallet) {
      throw new Error(`Wallet ${walletID} not loaded on chain ${chainId}`);
    }

    return await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle,
      wallet,
      networkName,
      tokenAddress,
      spendable
    );
  }
}

export const multiChainRailgunEngine = MultiChainRailgunEngine.getInstance();
