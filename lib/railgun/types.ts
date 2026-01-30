/**
 * Shared types for RAILGUN API routes
 */

export interface RailgunWalletInfo {
  walletID: string;
  railgunAddress: string;
  encryptionKey: string;
}

export interface EngineStatusResponse {
  status: 'uninitialized' | 'initializing' | 'ready' | 'error';
  error: string | null;
  network: string;
}

export interface WalletCreateRequest {
  mnemonic: string;
  password: string;
}

export interface WalletCreateResponse {
  success: boolean;
  walletID?: string;
  railgunAddress?: string;
  encryptionKey?: string; // Server-derived key for wallet operations
  error?: string;
}

export interface BalanceRequest {
  walletID: string;
  tokenAddress: string;
}

export interface BalanceResponse {
  success: boolean;
  spendable: string;
  total: string;
  tokenAddress: string;
  error?: string;
}

/**
 * Gas abstraction method for token approval
 * - 'eip7702': User signed EIP-7702 authorization, relayer submits Type 4 tx
 * - 'permit': User signed EIP-2612 permit, relayer calls permit() + transferFrom()
 * - 'approved': User already has sufficient allowance for relayer
 */
export type GasAbstractionMethod = 'eip7702' | 'permit' | 'approved';

/**
 * EIP-7702 signed authorization data
 */
export interface EIP7702Authorization {
  chainId: number;
  address: string; // BatchExecutor contract address
  nonce: number;
  yParity: number;
  r: string;
  s: string;
}

/**
 * EIP-2612 permit signature data
 */
export interface PermitData {
  owner: string;
  spender: string;
  value: string;
  deadline: string;
  v: number;
  r: string;
  s: string;
}

export interface TransferRequest {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string; // 0zk... address
  recipientAddress: string; // Public 0x address - we'll shield/unshield behind the scenes
  tokenAddress: string;
  amount: string; // In base units (e.g., "1000000" for 1 USDC)
  userAddress: string; // User's public wallet address
  
  // Gas abstraction - one of these should be provided
  gasAbstraction: GasAbstractionMethod;
  eip7702Auth?: EIP7702Authorization; // Required if gasAbstraction === 'eip7702'
  permitData?: PermitData; // Required if gasAbstraction === 'permit'
}

export type TransferStep = 
  | 'preparing'
  | 'approving'
  | 'shielding'
  | 'waiting_poi'
  | 'generating_proof'
  | 'transferring'
  | 'unshielding'
  | 'complete'
  | 'error';

export interface TransferProgress {
  step: TransferStep;
  progress: number; // 0-100
  message: string;
  txHash?: string;
}

export interface TransferResponse {
  success: boolean;
  shieldTxHash?: string;
  unshieldTxHash?: string;
  senderRailgunAddress?: string;
  error?: string;
}
