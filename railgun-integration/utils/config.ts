import { NetworkName } from "@railgun-community/shared-models";

export const NETWORK_CONFIG = {
  NETWORK: NetworkName.EthereumSepolia,
  CHAIN_ID: 11155111,

  RPC_URL: "https://sepolia.infura.io/v3/cbaa2a650a114902855799547b9c179f",

  TOKENS: {
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },

  // Use public test aggregator for testnet POI (more reliable for demos)
  POI_NODES: ["https://ppoi-agg.horsewithsixlegs.xyz"] as string[],
  DEPLOYMENT_BLOCK: {
    [NetworkName.EthereumSepolia]: 5585836,
  },

  UNSHIELD_ADDRESS: "0x643C5dD371461dcD8661b10b259dc0D938941598",
  PROXY_CONTRACT: "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea",
  GAS_SPONSOR_ADDRESS: "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea",

  GAS_PRICE_FALLBACK: {
    maxFeePerGas: BigInt(100 * 10**9),
    maxPriorityFeePerGas: BigInt(2 * 10**9),
  },

  DEFAULT_TX_MODE: "broadcaster" as const,
} as const;

export type TransactionMode = "broadcaster" | "self_signing";
