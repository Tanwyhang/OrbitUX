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

export interface TransferRequest {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string; // 0zk... address
  recipientAddress: string; // Public 0x address - we'll shield/unshield behind the scenes
  tokenAddress: string;
  amount: string; // In base units (e.g., "1000000" for 1 USDC)
  signerPrivateKey: string; // For self-signing mode
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
