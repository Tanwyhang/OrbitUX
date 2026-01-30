import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

// RainbowKit project ID - get one at https://cloud.walletconnect.com
// Using a demo ID for development - replace in production
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

// RPC URL matching RAILGUN config
const SEPOLIA_RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/lO9FWaEPl-y8mMJHInELW';

export const config = getDefaultConfig({
  appName: 'Orbit',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
  ssr: true,
});

// Token addresses for Sepolia (matching railgun-integration/utils/config.ts)
export const TOKENS = {
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
} as const;

// Pool swap token addresses (Sepolia)
export const SWAP_TOKENS = {
  ETH: '0x715f70ef11A65b4c8A7CCAa32E8aAaeE5011F15e',
  USDT: '0xa3750d39Fa8c377a7FB87FD1F2Be4321722E2c58',
  EURC: '0x326c5d56646A513151c75DFa5923eF6875dE53d5',
} as const;

// Pool addresses (Sepolia)
export const POOL_ADDRESSES = {
  ETH_USDT: '0xD8abab3a58b8c5F9d888dE55ab5EaCAB7C875340',
  EURC_USDT: '0x7f8Ac573Eb95b79e422a77FD01386afbB8e265bc',
  ETH_EURC: '0xfF0dd27e9Fa0c0DC5c02ed52822Cf7cD5F779892',
} as const;

// RAILGUN contract addresses for Sepolia
export const RAILGUN_CONTRACTS = {
  PROXY: '0x19b620929f97b7b990801496c3b361ca5def8c71',
  UNSHIELD: '0x643C5dD371461dcD8661b10b259dc0D938941598',
} as const;

// Etherscan URL for transaction links
export const EXPLORER_URL = 'https://sepolia.etherscan.io';
