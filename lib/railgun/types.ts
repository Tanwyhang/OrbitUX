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

/**
 * Single recipient input for batch transfers
 */
export interface TransferRecipientInput {
  address: string; // Public 0x address
  amount: string; // In base units (e.g., "1000000" for 1 USDC)
  tokenAddress: string; // ERC20 token address
}

/**
 * Legacy single-recipient transfer request (backward compatible)
 */
export interface TransferRequestLegacy {
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

/**
 * Batch transfer request supporting multiple recipients and tokens
 * 
 * Flow:
 * 1. User signs permits (one per unique token)
 * 2. Shield phase (one TX per unique token)
 * 3. Wait for POI (all tokens)
 * 4. Generate ZK proof (single proof covering all recipients)
 * 5. Unshield TX (single TX to all recipients)
 */
export interface TransferRequest {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string; // 0zk... address
  userAddress: string; // User's public wallet address
  
  // Multi-recipient support
  recipients: TransferRecipientInput[];
  
  // Per-token permits (keyed by token address)
  // Each unique token needs its own permit signature
  permits: Record<string, PermitData>;
  
  // Gas abstraction method (applies to all transfers)
  gasAbstraction: GasAbstractionMethod;
  eip7702Auth?: EIP7702Authorization; // Required if gasAbstraction === 'eip7702'
  
  // Legacy single-recipient fields (backward compatibility)
  recipientAddress?: string;
  tokenAddress?: string;
  amount?: string;
  permitData?: PermitData;
}

export type TransferStep = 
  | 'preparing'
  | 'approving'
  | 'shielding'       // Shielding tokens (per-token)
  | 'shielding_token' // Currently shielding specific token
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
  
  // Multi-token progress
  currentTokenIndex?: number;
  totalTokens?: number;
  currentToken?: string; // Token address being processed
  
  // Multi-recipient progress
  currentRecipientIndex?: number;
  totalRecipients?: number;
}

/**
 * Per-token shield result
 */
export interface TokenShieldResult {
  tokenAddress: string;
  amount: string; // Total amount shielded for this token
  shieldTxHash: string;
  status: 'pending' | 'confirmed' | 'error';
  error?: string;
}

/**
 * Per-recipient unshield result
 */
export interface RecipientUnshieldResult {
  address: string;
  tokenAddress: string;
  amount: string;
  status: 'pending' | 'complete' | 'error';
  error?: string;
}

/**
 * Batch transfer response
 */
export interface TransferResponse {
  success: boolean;
  
  // Per-token shield transactions (one per unique token)
  shieldResults?: TokenShieldResult[];
  
  // Single unshield TX for all recipients
  unshieldTxHash?: string;
  
  // Per-recipient results
  recipientResults?: RecipientUnshieldResult[];
  
  senderRailgunAddress?: string;
  error?: string;
  
  // Legacy single-transfer fields (backward compat)
  shieldTxHash?: string;
}
