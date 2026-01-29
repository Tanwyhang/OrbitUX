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
import { NETWORK_CONFIG } from "../utils/config";
import { createLogger } from "../utils/logger";
import { EngineError } from "../utils/errors";

const logger = createLogger("Engine");

class RailgunEngine {
  private static instance: RailgunEngine | null = null;
  private isInitialized: boolean = false;
  private isProviderLoaded: boolean = false;
  private engineName: string = "OrbitNeobank";
  private dbPath: string;
  private db: AbstractLevelDOWN | null = null;

  private constructor() {
    this.dbPath = path.join(process.cwd(), "engine.db");
  }

  static getInstance(): RailgunEngine {
    if (!RailgunEngine.instance) {
      RailgunEngine.instance = new RailgunEngine();
    }
    return RailgunEngine.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Engine already initialized");
      return;
    }

    try {
      logger.info("Initializing RAILGUN engine...");

      const artifactStore = this.createArtifactStore();
      this.db = leveldown(this.dbPath) as AbstractLevelDOWN;

      await startRailgunEngine(
        this.engineName,
        this.db,
        false,
        artifactStore,
        false,
        false,
        NETWORK_CONFIG.POI_NODES
      );

      this.setupProver();

      this.isInitialized = true;
      logger.info("RAILGUN engine initialized successfully");

      process.on('SIGINT', async () => {
        await this.shutdown();
        process.exit(0);
      });

    } catch (error) {
      logger.error("Failed to initialize RAILGUN engine", error);
      throw new EngineError(`Engine initialization failed: ${error}`);
    }
  }

  /**
   * Load network provider for transactions.
   * Must be called after initialize() before performing any transactions.
   * 
   * @param rpcUrl - Optional RPC URL (defaults to NETWORK_CONFIG.RPC_URL)
   */
  async loadNetworkProvider(rpcUrl?: string): Promise<void> {
    if (!this.isInitialized) {
      throw new EngineError("Engine not initialized. Call initialize() first.");
    }

    if (this.isProviderLoaded) {
      logger.warn("Provider already loaded");
      return;
    }

    try {
      const networkName = NETWORK_CONFIG.NETWORK;
      const networkConfig = RAILGUN_NETWORK_CONFIG[networkName];
      
      if (!networkConfig) {
        throw new EngineError(`Network config not found for: ${networkName}`);
      }

      const providerUrl = rpcUrl ?? NETWORK_CONFIG.RPC_URL;
      
      logger.info(`Loading provider for ${networkName}...`);
      logger.debug(`RPC URL: ${providerUrl}`);

      const providerConfig: FallbackProviderJsonConfig = {
        chainId: networkConfig.chain.id,
        providers: [
          {
            provider: providerUrl,
            priority: 3,
            weight: 2,
            maxLogsPerBatch: 1,
          },
        ],
      };

      const pollingInterval = 1000 * 60 * 5; // 5 minutes

      await loadProvider(providerConfig, networkName, pollingInterval);

      this.isProviderLoaded = true;
      logger.info(`Provider loaded for ${networkName}`);

    } catch (error) {
      logger.error("Failed to load network provider", error);
      throw new EngineError(`Provider loading failed: ${error}`);
    }
  }

  private createArtifactStore(): ArtifactStore {
    const artifactsDir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    return new ArtifactStore(
      async (filePath: string) => {
        const fullPath = path.join(artifactsDir, filePath);
        return fs.promises.readFile(fullPath);
      },
      async (dir: string, filePath: string, item: string | Uint8Array) => {
        // Just use filePath directly - it already contains the full relative path
        const fullPath = path.join(artifactsDir, filePath);
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        return fs.promises.writeFile(fullPath, item);
      },
      async (filePath: string) => {
        return fs.existsSync(path.join(artifactsDir, filePath));
      },
    );
  }

  private setupProver(): void {
    const snarkjsAdapter: SnarkJSGroth16 = {
      fullProve: async (formattedInputs, wasm, zkey, logger) => {
        return groth16.fullProve(
          formattedInputs as any,
          wasm as any,
          zkey as any,
          logger
        ) as any;
      },
      verify: (vkey: any, publicSignals: any, proof: any) => {
        return groth16.verify(vkey, publicSignals, proof);
      },
    };

    getProver().setSnarkJSGroth16(snarkjsAdapter);
    logger.debug("Groth16 prover configured"    );
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn("Engine not initialized, nothing to shutdown");
      return;
    }

    try {
      logger.info("Shutting down RAILGUN engine...");
      await stopRailgunEngine();
      this.isInitialized = false;
      this.isProviderLoaded = false;
      logger.info("RAILGUN engine shut down successfully");
    } catch (error) {
      logger.error("Failed to shutdown RAILGUN engine", error);
      throw new EngineError(`Engine shutdown failed: ${error}`);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  isNetworkReady(): boolean {
    return this.isInitialized && this.isProviderLoaded;
  }

  getEngineName(): string {
    return this.engineName;
  }

  getTxidVersion(): TXIDVersion {
    return TXIDVersion.V2_PoseidonMerkle;
  }

  getNetwork(): NetworkName {
    return NETWORK_CONFIG.NETWORK;
  }
}

export const engine = RailgunEngine.getInstance();
