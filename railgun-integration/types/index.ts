import type { TransactionGasDetails } from "@railgun-community/shared-models";
import type { TransactionMode } from "../utils/config";

export interface TransactionOptions {
  mode: TransactionMode;
  broadcasterFeeTokenAddress?: string;
  useRelayAdapt?: boolean;
}

export interface BroadcasterFeeInfo {
  tokenAddress: string;
  amount: bigint;
  recipientAddress: string;
}

export interface TransactionResult {
  txHash: string;
  mode: TransactionMode;
  broadcaster?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

export interface RailgunWalletInfo {
  walletID: string;
  railgunAddress: string;
  encryptionKey: string;
}

export interface ShieldParams {
  tokenAddress: string;
  amount: bigint;
  recipientRailgunAddress: string;
}

export interface TransferParams {
  senderWalletID: string;
  encryptionKey: string;
  tokenAddress: string;
  amount: bigint;
  recipientRailgunAddress: string;
  memo?: string;
}

export interface UnshieldParams {
  senderWalletID: string;
  encryptionKey: string;
  tokenAddress: string;
  amount: bigint;
  recipientPublicAddress: string;
}
