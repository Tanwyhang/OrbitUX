/**
 * Server-side RAILGUN Transfer Service with Full Gas Abstraction
 * 
 * Complete private transfer flow with ZERO gas cost to user:
 * 
 * 1. If permit provided: Relayer calls permit() on-chain (user signed gasless message)
 * 2. Relayer calls transferFrom() to pull tokens from user
 * 3. Shield tokens (relayer public → user's private balance) - relayer pays gas
 * 4. Wait for POI verification (~60s)
 * 5. Generate ZK proof for unshield
 * 6. Unshield to recipient (user's private → recipient public) - relayer pays gas
 * 
 * From user perspective: Sign once (gasless), transfer happens privately.
 * User pays ZERO gas - relayer sponsors everything.
 */

import { ethers, Contract } from "ethers";
import {
  NetworkName,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG,
  type TransactionGasDetails,
  type RailgunERC20AmountRecipient,
} from "@railgun-community/shared-models";
import {
  refreshBalances,
  balanceForERC20Token,
  walletForID,
  loadWalletByID,
  getShieldPrivateKeySignatureMessage,
  gasEstimateForShield,
  populateShield,
  gasEstimateForUnprovenUnshield,
  generateUnshieldProof,
  populateProvedUnshield,
} from "@railgun-community/wallet";
import { keccak256, toUtf8Bytes } from "ethers";
import { railgunEngine } from "./engine";
import { relayerService } from "./relayer";
import { railgunWallet } from "./wallet";
import type { 
  TransferStep, 
  TransferProgress, 
  GasAbstractionMethod, 
  PermitData, 
  EIP7702Authorization,
  TransferRecipientInput,
  TokenShieldResult,
  RecipientUnshieldResult,
} from "./types";

// Network config - RAILGUN proxy contract on Sepolia
// This is the contract that populateShield() sends tokens to
const RAILGUN_PROXY = "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea";

// Token metadata for supported stablecoins
const TOKEN_METADATA: Record<string, { symbol: string; decimals: number }> = {
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238': { symbol: 'USDC', decimals: 6 },
  '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06': { symbol: 'USDT', decimals: 6 },
  '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6': { symbol: 'DAI', decimals: 18 },
};

/**
 * Get token decimals for a given token address
 * Defaults to 18 decimals if not found
 */
function getTokenDecimals(tokenAddress: string): number {
  const normalized = tokenAddress.toLowerCase();
  for (const [addr, meta] of Object.entries(TOKEN_METADATA)) {
    if (addr.toLowerCase() === normalized) {
      return meta.decimals;
    }
  }
  return 18; // Default to 18 decimals
}

/**
 * Retry an async operation with exponential backoff.
 * @param fn - The async function to retry
 * @param operationName - Name for logging
 * @param maxRetries - Maximum retry attempts (default 3)
 * @param initialDelayMs - Initial delay between retries (default 2000ms)
 * @param onRetry - Optional callback for progress updates during retries
 * @returns The result of the function
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  initialDelayMs: number = 2000,
  onRetry?: (attempt: number, maxAttempts: number, error: string) => void
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        console.log(`[Transfer] ${operationName} failed after ${maxRetries} attempts`);
        throw lastError;
      }
      
      console.log(`[Transfer] ${operationName} attempt ${attempt} failed: ${lastError.message}`);
      console.log(`[Transfer] Retrying in ${delayMs}ms...`);
      
      // Notify about retry via callback
      onRetry?.(attempt, maxRetries, lastError.message);
      
      await new Promise(r => setTimeout(r, delayMs));
      delayMs *= 2; // Exponential backoff
    }
  }
  
  throw lastError || new Error(`${operationName} failed`);
}

// ERC20 ABI with permit support
const ERC20_WITH_PERMIT_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint256)",
];

export type ProgressCallback = (progress: TransferProgress) => void;

/**
 * Legacy single-recipient transfer params (backward compat)
 */
interface TransferParams {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  recipientPublicAddress: string;
  tokenAddress: string;
  amount: bigint;
  userAddress: string;
  
  // Gas abstraction
  gasAbstraction: GasAbstractionMethod;
  permitData?: PermitData;
  eip7702Auth?: EIP7702Authorization;
  
  onProgress?: ProgressCallback;
}

/**
 * Batch transfer params supporting multiple recipients and tokens
 */
interface BatchTransferParams {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;
  
  // Wallet recreation fields (required for serverless environments)
  // The mnemonic is needed to recreate the wallet on each request
  mnemonic: string;
  password: string;
  
  // Multiple recipients (can have different tokens)
  recipients: TransferRecipientInput[];
  
  // Per-token permits (keyed by token address)
  permits: Record<string, PermitData>;
  
  // Gas abstraction
  gasAbstraction: GasAbstractionMethod;
  eip7702Auth?: EIP7702Authorization;
  
  onProgress?: ProgressCallback;
}

/**
 * Batch transfer result
 */
interface BatchTransferResult {
  success: boolean;
  shieldResults?: TokenShieldResult[];
  unshieldTxHash?: string;
  recipientResults?: RecipientUnshieldResult[];
  senderRailgunAddress?: string;
  error?: string;
  
  // Legacy single-transfer fields
  shieldTxHash?: string;
}

class RailgunTransferService {
  private static instance: RailgunTransferService | null = null;

  private constructor() {}

  static getInstance(): RailgunTransferService {
    if (!RailgunTransferService.instance) {
      RailgunTransferService.instance = new RailgunTransferService();
    }
    return RailgunTransferService.instance;
  }

  /**
   * Execute permit on-chain (relayer pays gas)
   * User signed a gasless EIP-2612 permit message
   */
  private async executePermit(
    tokenContract: Contract,
    permitData: PermitData
  ): Promise<string> {
    console.log('[Transfer] Executing permit on-chain...');
    console.log('[Transfer] Permit owner:', permitData.owner);
    console.log('[Transfer] Permit spender:', permitData.spender);
    console.log('[Transfer] Permit value:', permitData.value);
    console.log('[Transfer] Permit deadline:', permitData.deadline);

    const tx = await tokenContract.permit(
      permitData.owner,
      permitData.spender,
      BigInt(permitData.value),
      BigInt(permitData.deadline),
      permitData.v,
      permitData.r,
      permitData.s,
      { gasLimit: 100000 } // Explicit gas limit for permit
    );

    const receipt = await tx.wait();
    console.log('[Transfer] Permit executed:', tx.hash);
    return tx.hash;
  }

  /**
   * Execute a complete private transfer with gas abstraction.
   * 
   * Flow: 
   * 1. (If permit) Execute permit on-chain
   * 2. TransferFrom user to relayer
   * 3. Shield → Private Balance → Unshield → Recipient
   */
  async executeTransfer(params: TransferParams): Promise<{
    success: boolean;
    shieldTxHash?: string;
    unshieldTxHash?: string;
    senderRailgunAddress?: string;
    error?: string;
  }> {
    const { 
      senderWalletID, 
      senderEncryptionKey: clientEncryptionKey,
      senderRailgunAddress,
      recipientPublicAddress,
      tokenAddress,
      amount,
      userAddress,
      gasAbstraction,
      permitData,
      eip7702Auth,
      onProgress 
    } = params;

    const progress = (step: TransferStep, pct: number, message: string, txHash?: string) => {
      console.log(`[Transfer] ${step}: ${message} (${pct}%)`);
      onProgress?.({ step, progress: pct, message, txHash });
    };

    try {
      if (!railgunEngine.isReady()) {
        throw new Error("RAILGUN engine not initialized");
      }

      if (!relayerService.isConfigured()) {
        throw new Error("Relayer not configured. Add RELAYER_PRIVATE_KEY to .env.local");
      }

      // Get the server-side cached encryption key for this wallet
      // The client-side key derivation may differ, so we use our cached version
      const cachedWallet = railgunWallet.getCachedWalletByID(senderWalletID);
      const senderEncryptionKey = cachedWallet?.encryptionKey || clientEncryptionKey;
      
      if (cachedWallet) {
        console.log('[Transfer] Using server-cached encryption key for wallet:', senderWalletID);
      } else {
        console.log('[Transfer] Warning: Wallet not in server cache. This may cause decryption issues.');
        console.log('[Transfer] Wallet ID:', senderWalletID);
        console.log('[Transfer] Client encryption key (first 20 chars):', clientEncryptionKey.slice(0, 20) + '...');
      }

      // Verify the wallet exists in the RAILGUN SDK, or try to load it
      let abstractWallet = walletForID(senderWalletID);
      if (!abstractWallet) {
        console.log('[Transfer] Wallet not found in engine, attempting to load...');
        try {
          await loadWalletByID(senderEncryptionKey, senderWalletID, false);
          abstractWallet = walletForID(senderWalletID);
          console.log('[Transfer] Wallet loaded successfully');
        } catch (loadError) {
          console.error('[Transfer] Failed to load wallet:', loadError);
          throw new Error(`Wallet ${senderWalletID} not found and could not be loaded. Please recreate the wallet.`);
        }
      }
      
      if (!abstractWallet) {
        throw new Error(`Wallet ${senderWalletID} not found in RAILGUN engine. Please recreate the wallet.`);
      }
      console.log('[Transfer] Wallet verified in RAILGUN engine');

      const networkName = railgunEngine.getNetwork();
      const txidVersion = railgunEngine.getTxidVersion();
      const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

      // Get relayer wallet (pays gas) and provider
      const relayerWallet = relayerService.getWallet();
      const provider = relayerService.getProvider();
      const relayerAddress = relayerWallet.address;
      
      console.log('[Transfer] === GASLESS TRANSFER STARTED ===');
      console.log('[Transfer] Gas abstraction method:', gasAbstraction);
      console.log('[Transfer] Relayer address:', relayerAddress);
      console.log('[Transfer] User address:', userAddress);
      console.log('[Transfer] Amount:', ethers.formatUnits(amount, 6), 'USDC');
      console.log('[Transfer] Recipient:', recipientPublicAddress);

      const tokenContract = new Contract(tokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Handle gas abstraction - execute permit if needed
      // ════════════════════════════════════════════════════════════════
      if (gasAbstraction === 'permit' && permitData) {
        progress('approving', 5, 'Executing gasless approval (relayer pays gas)...');
        
        await this.executePermit(tokenContract, permitData);
        console.log('[Transfer] Permit executed - user paid ZERO gas for approval!');
      } else if (gasAbstraction === 'eip7702' && eip7702Auth) {
        // TODO: Implement EIP-7702 Type 4 transaction
        // This requires sending a transaction with authorization_list
        progress('approving', 5, 'EIP-7702 authorization (experimental)...');
        throw new Error('EIP-7702 support coming soon - use permit for now');
      } else if (gasAbstraction === 'approved') {
        progress('approving', 5, 'Using existing approval...');
        console.log('[Transfer] User already has sufficient allowance');
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Verify allowance and pull tokens from user
      // ════════════════════════════════════════════════════════════════
      progress('approving', 8, 'Verifying token allowance...');

      const userAllowance = await tokenContract.allowance(userAddress, relayerAddress);
      console.log('[Transfer] User allowance for relayer:', ethers.formatUnits(userAllowance, 6));
      
      if (userAllowance < amount) {
        throw new Error(
          `Insufficient allowance. Have: ${ethers.formatUnits(userAllowance, 6)}, Need: ${ethers.formatUnits(amount, 6)}. ` +
          `Permit may have failed or expired.`
        );
      }

      // Pull tokens from user to relayer
      progress('approving', 10, 'Pulling tokens from user wallet...');
      const transferFromTx = await tokenContract.transferFrom(
        userAddress, 
        relayerAddress, 
        amount,
        { gasLimit: 100000 }
      );
      await transferFromTx.wait();
      console.log('[Transfer] Tokens transferred to relayer:', transferFromTx.hash);

      // ════════════════════════════════════════════════════════════════
      // STEP 3: Approve RAILGUN proxy to spend relayer's tokens
      // ════════════════════════════════════════════════════════════════
      progress('approving', 12, 'Approving RAILGUN proxy...');
      
      const relayerAllowance = await tokenContract.allowance(relayerAddress, RAILGUN_PROXY);
      if (relayerAllowance < amount) {
        const approveTx = await tokenContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
        await approveTx.wait();
        console.log('[Transfer] Relayer approved RAILGUN proxy');
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Shield tokens (relayer public → user's private balance)
      // ════════════════════════════════════════════════════════════════
      progress('shielding', 15, 'Preparing shield transaction...');

      const shieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress,
        amount,
        recipientAddress: senderRailgunAddress,
      }];

      const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
      const shieldPrivateKey = keccak256(toUtf8Bytes(shieldSignatureMessage));

      const { gasEstimate: shieldGasEstimate } = await gasEstimateForShield(
        txidVersion,
        networkName,
        shieldPrivateKey,
        shieldRecipients,
        [],
        relayerAddress
      );

      const feeData = await provider.getFeeData();
      const shieldGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: shieldGasEstimate,
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      const { transaction: shieldTx } = await populateShield(
        txidVersion,
        networkName,
        shieldPrivateKey,
        shieldRecipients,
        [],
        shieldGasDetails
      );

      progress('shielding', 20, 'Sending shield transaction...');
      const shieldTxResponse = await relayerWallet.sendTransaction(shieldTx);
      console.log('[Transfer] Shield TX sent:', shieldTxResponse.hash);

      progress('shielding', 25, 'Waiting for shield confirmation...', shieldTxResponse.hash);
      await shieldTxResponse.wait();
      console.log('[Transfer] Shield confirmed');

      // ════════════════════════════════════════════════════════════════
      // STEP 5: Wait for POI verification
      // ════════════════════════════════════════════════════════════════
      progress('waiting_poi', 30, 'Waiting for Proof of Innocence verification...');

      // RAILGUN takes a ~0.25% shield fee, so we expect slightly less than the original amount
      // We'll wait for at least 99% of the original amount (accounting for fee + rounding)
      const minExpectedBalance = (amount * BigInt(99)) / BigInt(100);
      console.log(`[Transfer] Waiting for balance >= ${ethers.formatUnits(minExpectedBalance, 6)} USDC (99% of ${ethers.formatUnits(amount, 6)})`);

      let spendableBalance = BigInt(0);
      const maxWaitTime = 120000;
      const pollInterval = 5000;
      const startTime = Date.now();

      while (spendableBalance < minExpectedBalance && Date.now() - startTime < maxWaitTime) {
        await new Promise(r => setTimeout(r, pollInterval));
        
        await refreshBalances(chain, [senderWalletID]);
        
        const abstractWallet = walletForID(senderWalletID);
        spendableBalance = await balanceForERC20Token(
          txidVersion,
          abstractWallet,
          networkName,
          tokenAddress,
          true
        );

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const progressPct = Math.min(30 + Math.floor(elapsed / 2), 45);
        progress('waiting_poi', progressPct, `POI verification... ${elapsed}s elapsed`);
        
        console.log(`[Transfer] Spendable balance: ${ethers.formatUnits(spendableBalance, 6)} USDC`);
      }

      if (spendableBalance < minExpectedBalance) {
        throw new Error(`POI verification timeout. Spendable: ${ethers.formatUnits(spendableBalance, 6)}, Need: ${ethers.formatUnits(minExpectedBalance, 6)}`);
      }

      console.log(`[Transfer] POI verified, spendable balance: ${ethers.formatUnits(spendableBalance, 6)} USDC`);

      // ════════════════════════════════════════════════════════════════
      // STEP 6: Generate ZK proof for unshield
      // ════════════════════════════════════════════════════════════════
      progress('generating_proof', 50, 'Generating ZK proof (20-40 seconds)...');

      // Calculate the amount to unshield: original amount minus RAILGUN shield fee (~0.25%)
      // We unshield what we actually shielded (after fee), not the total spendable balance
      // The fee is 25 basis points (0.25%)
      const SHIELD_FEE_BASIS_POINTS = BigInt(25);
      const shieldFee = (amount * SHIELD_FEE_BASIS_POINTS) / BigInt(10000);
      const unshieldAmount = amount - shieldFee;
      
      // Verify we have enough spendable balance
      if (spendableBalance < unshieldAmount) {
        throw new Error(`Insufficient spendable balance. Have: ${ethers.formatUnits(spendableBalance, 6)}, Need: ${ethers.formatUnits(unshieldAmount, 6)}`);
      }
      
      console.log(`[Transfer] Original amount: ${ethers.formatUnits(amount, 6)} USDC`);
      console.log(`[Transfer] Shield fee (~0.25%): ${ethers.formatUnits(shieldFee, 6)} USDC`);
      console.log(`[Transfer] Unshielding: ${ethers.formatUnits(unshieldAmount, 6)} USDC to recipient`);

      const unshieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress,
        amount: unshieldAmount,
        recipientAddress: recipientPublicAddress,
      }];

      const originalGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(0),
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      progress('generating_proof', 52, 'Estimating gas for unshield...');

      const { gasEstimate: unshieldGasEstimate } = await withRetry(
        () => gasEstimateForUnprovenUnshield(
          txidVersion,
          networkName,
          senderWalletID,
          senderEncryptionKey,
          unshieldRecipients,
          [],
          originalGasDetails,
          undefined,
          true
        ),
        'Gas estimation',
        3,  // max retries
        3000, // start with 3s delay
        (attempt, max, err) => {
          progress('generating_proof', 52, `Network slow, retrying gas estimation (attempt ${attempt + 1}/${max})...`);
        }
      );

      const unshieldGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: unshieldGasEstimate,
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      const overallBatchMinGasPrice = calculateGasPrice(unshieldGasDetails);

      await withRetry(
        () => generateUnshieldProof(
          txidVersion,
          networkName,
          senderWalletID,
          senderEncryptionKey,
          unshieldRecipients,
          [],
          undefined,
          true,
          overallBatchMinGasPrice,
          (proofProgress) => {
            const pct = 55 + Math.floor(proofProgress * 0.25);
            progress('generating_proof', pct, `Generating ZK proof... ${proofProgress}%`);
          }
        ),
        'ZK proof generation',
        3,  // max retries
        5000, // start with 5s delay (proof gen is slow)
        (attempt, max, err) => {
          progress('generating_proof', 55, `Network slow, retrying proof generation (attempt ${attempt + 1}/${max})...`);
        }
      );

      console.log('[Transfer] ZK proof generated');

      // ════════════════════════════════════════════════════════════════
      // STEP 7: Unshield to recipient
      // ════════════════════════════════════════════════════════════════
      progress('unshielding', 85, 'Unshielding to recipient...');

      const { transaction: unshieldTx } = await withRetry(
        () => populateProvedUnshield(
          txidVersion,
          networkName,
          senderWalletID,
          unshieldRecipients,
          [],
          undefined,
          true,
          overallBatchMinGasPrice,
          unshieldGasDetails
        ),
        'Populate unshield transaction',
        3,
        2000,
        (attempt, max, err) => {
          progress('unshielding', 85, `Network slow, retrying transaction build (attempt ${attempt + 1}/${max})...`);
        }
      );

      const unshieldTxResponse = await relayerWallet.sendTransaction(unshieldTx);
      console.log('[Transfer] Unshield TX sent:', unshieldTxResponse.hash);

      progress('unshielding', 90, 'Waiting for unshield confirmation...', unshieldTxResponse.hash);
      await unshieldTxResponse.wait();
      console.log('[Transfer] Unshield confirmed');

      // ════════════════════════════════════════════════════════════════
      // COMPLETE
      // ════════════════════════════════════════════════════════════════
      progress('complete', 100, 'Transfer complete!', unshieldTxResponse.hash);
      console.log('[Transfer] === GASLESS TRANSFER COMPLETE ===');
      console.log('[Transfer] User paid: ZERO gas');
      console.log('[Transfer] Shield TX:', shieldTxResponse.hash);
      console.log('[Transfer] Unshield TX:', unshieldTxResponse.hash);

      return {
        success: true,
        shieldTxHash: shieldTxResponse.hash,
        unshieldTxHash: unshieldTxResponse.hash,
        senderRailgunAddress,
      };

    } catch (error) {
      console.error('[Transfer] Failed:', error);
      progress('error', 0, error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a batch transfer with multiple recipients and potentially multiple tokens.
   * 
   * Flow:
   * 1. Group recipients by token
   * 2. Execute permit per token (if needed)
   * 3. TransferFrom user to relayer for each token
   * 4. Shield each token separately (one TX per token)
   * 5. Wait for POI on all tokens
   * 6. Generate single ZK proof covering all recipients
   * 7. Single unshield TX to all recipients
   */
  async executeBatchTransfer(params: BatchTransferParams): Promise<BatchTransferResult> {
    const {
      senderWalletID,
      senderEncryptionKey: clientEncryptionKey,
      senderRailgunAddress,
      userAddress,
      mnemonic,
      password,
      recipients,
      permits,
      gasAbstraction,
      eip7702Auth,
      onProgress,
    } = params;

    const progress = (
      step: TransferStep, 
      pct: number, 
      message: string, 
      txHash?: string,
      tokenInfo?: { current: number; total: number; address: string },
      recipientInfo?: { current: number; total: number }
    ) => {
      console.log(`[BatchTransfer] ${step}: ${message} (${pct}%)`);
      onProgress?.({ 
        step, 
        progress: pct, 
        message, 
        txHash,
        currentTokenIndex: tokenInfo?.current,
        totalTokens: tokenInfo?.total,
        currentToken: tokenInfo?.address,
        currentRecipientIndex: recipientInfo?.current,
        totalRecipients: recipientInfo?.total,
      });
    };

    const shieldResults: TokenShieldResult[] = [];
    const recipientResults: RecipientUnshieldResult[] = recipients.map(r => ({
      address: r.address,
      tokenAddress: r.tokenAddress,
      amount: r.amount,
      status: 'pending' as const,
    }));

    try {
      if (!railgunEngine.isReady()) {
        throw new Error("RAILGUN engine not initialized");
      }

      if (!relayerService.isConfigured()) {
        throw new Error("Relayer not configured. Add RELAYER_PRIVATE_KEY to .env.local");
      }

      // SERVERLESS FIX: Always recreate wallet from mnemonic
      // In serverless environments (Vercel, AWS Lambda), the in-memory wallet cache
      // and memdown database are cleared on each cold start. Instead of trying to
      // load an existing wallet (which will fail), we recreate it from the mnemonic.
      console.log('[BatchTransfer] Recreating wallet from mnemonic (serverless-safe)...');
      const recreatedWallet = await railgunWallet.createWalletFromMnemonic(mnemonic, password);
      const senderEncryptionKey = recreatedWallet.encryptionKey;
      
      // Verify the recreated wallet matches the expected wallet ID
      if (recreatedWallet.walletID !== senderWalletID) {
        console.log('[BatchTransfer] Note: Wallet ID changed after recreation');
        console.log('[BatchTransfer] Expected:', senderWalletID);
        console.log('[BatchTransfer] Got:', recreatedWallet.walletID);
        // This is OK - the SDK may generate different IDs, but the 0zk address is deterministic
      }
      
      // Get the wallet from the SDK (should now exist after recreation)
      const abstractWallet = walletForID(recreatedWallet.walletID);
      if (!abstractWallet) {
        throw new Error('Failed to recreate wallet - wallet not found in engine after creation');
      }
      
      // Use the recreated wallet ID for all subsequent operations
      const activeWalletID = recreatedWallet.walletID;

      const networkName = railgunEngine.getNetwork();
      const txidVersion = railgunEngine.getTxidVersion();
      const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

      const relayerWallet = relayerService.getWallet();
      const provider = relayerService.getProvider();
      const relayerAddress = relayerWallet.address;

      console.log('[BatchTransfer] === BATCH GASLESS TRANSFER STARTED ===');
      console.log('[BatchTransfer] Recipients:', recipients.length);
      console.log('[BatchTransfer] Gas abstraction:', gasAbstraction);
      console.log('[BatchTransfer] Relayer:', relayerAddress);

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Group recipients by token
      // ════════════════════════════════════════════════════════════════
      progress('preparing', 5, `Grouping ${recipients.length} recipients by token...`);

      const tokenGroups: Record<string, { recipients: TransferRecipientInput[]; total: bigint }> = {};
      for (const recipient of recipients) {
        if (!tokenGroups[recipient.tokenAddress]) {
          tokenGroups[recipient.tokenAddress] = { recipients: [], total: BigInt(0) };
        }
        tokenGroups[recipient.tokenAddress].recipients.push(recipient);
        tokenGroups[recipient.tokenAddress].total += BigInt(recipient.amount);
      }

      const tokenAddresses = Object.keys(tokenGroups);
      console.log('[BatchTransfer] Unique tokens:', tokenAddresses.length);

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Execute permits and pull tokens for each token type
      // ════════════════════════════════════════════════════════════════
      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i];
        const { total: amount } = tokenGroups[tokenAddress];
        const permitData = permits[tokenAddress];

        const tokenContract = new Contract(tokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);

        progress(
          'approving', 
          10 + Math.floor((i / tokenAddresses.length) * 5),
          `Processing token ${i + 1}/${tokenAddresses.length}...`,
          undefined,
          { current: i, total: tokenAddresses.length, address: tokenAddress }
        );

        // Execute permit if provided
        if (gasAbstraction === 'permit' && permitData) {
          await this.executePermit(tokenContract, permitData);
          console.log(`[BatchTransfer] Permit executed for token ${tokenAddress}`);
        } else if (gasAbstraction === 'eip7702' && eip7702Auth) {
          throw new Error('EIP-7702 support coming soon - use permit for now');
        }

        // Verify allowance
        const userAllowance = await tokenContract.allowance(userAddress, relayerAddress);
        const tokenDecimals = getTokenDecimals(tokenAddress);
        if (userAllowance < amount) {
          throw new Error(
            `Insufficient allowance for token ${tokenAddress}. Have: ${ethers.formatUnits(userAllowance, tokenDecimals)}, Need: ${ethers.formatUnits(amount, tokenDecimals)}`
          );
        }

        // Pull tokens from user
        const transferFromTx = await tokenContract.transferFrom(
          userAddress,
          relayerAddress,
          amount,
          { gasLimit: 100000 }
        );
        await transferFromTx.wait();
        console.log(`[BatchTransfer] Pulled ${ethers.formatUnits(amount, tokenDecimals)} of token ${tokenAddress}`);

        // Approve RAILGUN proxy if needed
        const relayerAllowance = await tokenContract.allowance(relayerAddress, RAILGUN_PROXY);
        if (relayerAllowance < amount) {
          const approveTx = await tokenContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
          await approveTx.wait();
        }
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 3: Shield each token separately
      // ════════════════════════════════════════════════════════════════
      const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
      const shieldPrivateKey = keccak256(toUtf8Bytes(shieldSignatureMessage));
      const feeData = await provider.getFeeData();

      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i];
        const { total: amount } = tokenGroups[tokenAddress];

        progress(
          'shielding_token',
          20 + Math.floor((i / tokenAddresses.length) * 15),
          `Shielding token ${i + 1}/${tokenAddresses.length}...`,
          undefined,
          { current: i, total: tokenAddresses.length, address: tokenAddress }
        );

        const shieldRecipients: RailgunERC20AmountRecipient[] = [{
          tokenAddress,
          amount,
          recipientAddress: senderRailgunAddress,
        }];

        const { gasEstimate: shieldGasEstimate } = await gasEstimateForShield(
          txidVersion,
          networkName,
          shieldPrivateKey,
          shieldRecipients,
          [],
          relayerAddress
        );

        const shieldGasDetails: TransactionGasDetails = {
          evmGasType: EVMGasType.Type2,
          gasEstimate: shieldGasEstimate,
          maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
        };

        const { transaction: shieldTx } = await populateShield(
          txidVersion,
          networkName,
          shieldPrivateKey,
          shieldRecipients,
          [],
          shieldGasDetails
        );

        const shieldTxResponse = await relayerWallet.sendTransaction(shieldTx);
        console.log(`[BatchTransfer] Shield TX for ${tokenAddress}:`, shieldTxResponse.hash);

        await shieldTxResponse.wait();

        shieldResults.push({
          tokenAddress,
          amount: amount.toString(),
          shieldTxHash: shieldTxResponse.hash,
          status: 'confirmed',
        });
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Wait for POI on all tokens
      // ════════════════════════════════════════════════════════════════
      progress('waiting_poi', 40, 'Waiting for Proof of Innocence verification on all tokens...');

      const SHIELD_FEE_BASIS_POINTS = BigInt(25); // 0.25%
      const maxWaitTimePerToken = 120000; // 120 seconds per token
      const pollInterval = 5000;
      const overallStartTime = Date.now();

      // Wait for spendable balance on each token
      // Each token gets its own timeout to avoid race conditions
      for (let tokenIdx = 0; tokenIdx < tokenAddresses.length; tokenIdx++) {
        const tokenAddress = tokenAddresses[tokenIdx];
        const { total: originalAmount } = tokenGroups[tokenAddress];
        const minExpectedBalance = (originalAmount * BigInt(99)) / BigInt(100);
        
        let spendableBalance = BigInt(0);
        const tokenStartTime = Date.now(); // Fresh start time for each token
        
        while (spendableBalance < minExpectedBalance && Date.now() - tokenStartTime < maxWaitTimePerToken) {
          await new Promise(r => setTimeout(r, pollInterval));
          await refreshBalances(chain, [activeWalletID]);
          
          const wallet = walletForID(activeWalletID);
          spendableBalance = await balanceForERC20Token(
            txidVersion,
            wallet,
            networkName,
            tokenAddress,
            true
          );

          const elapsed = Math.floor((Date.now() - overallStartTime) / 1000);
          const tokenProgress = 40 + ((tokenIdx / tokenAddresses.length) * 10) + Math.min((Date.now() - tokenStartTime) / maxWaitTimePerToken * 5, 5);
          progress('waiting_poi', Math.floor(tokenProgress), `POI verification... ${elapsed}s elapsed (token ${tokenIdx + 1}/${tokenAddresses.length})`);
        }

        if (spendableBalance < minExpectedBalance) {
          throw new Error(`POI timeout for token ${tokenAddress}`);
        }
        
        console.log(`[BatchTransfer] POI verified for ${tokenAddress}`);
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 5 & 6: Generate ZK proofs and unshield to each recipient
      // RAILGUN SDK limitation: only one recipient per token per TX
      // So we process each recipient individually
      // ════════════════════════════════════════════════════════════════
      progress('generating_proof', 55, `Generating ZK proofs for ${recipients.length} recipients...`);

      const originalGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(0),
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      let lastUnshieldTxHash: string | undefined;

      // Process each recipient individually
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const originalAmount = BigInt(recipient.amount);
        const shieldFee = (originalAmount * SHIELD_FEE_BASIS_POINTS) / BigInt(10000);
        const unshieldAmount = originalAmount - shieldFee;

        const recipientProgressBase = 55 + (i / recipients.length) * 40;
        progress(
          'generating_proof', 
          Math.floor(recipientProgressBase), 
          `Processing recipient ${i + 1}/${recipients.length}...`,
          undefined,
          undefined,
          { current: i, total: recipients.length }
        );

        // Build single-recipient unshield array
        const unshieldRecipients: RailgunERC20AmountRecipient[] = [{
          tokenAddress: recipient.tokenAddress,
          amount: unshieldAmount,
          recipientAddress: recipient.address,
        }];

        // Gas estimation for this recipient
        const { gasEstimate: unshieldGasEstimate } = await withRetry(
          () => gasEstimateForUnprovenUnshield(
            txidVersion,
            networkName,
            activeWalletID,
            senderEncryptionKey,
            unshieldRecipients,
            [],
            originalGasDetails,
            undefined,
            true
          ),
          `Gas estimation for recipient ${i + 1}`,
          3,
          3000,
          (attempt, max) => {
            progress('generating_proof', Math.floor(recipientProgressBase), `Retrying gas estimation (attempt ${attempt + 1}/${max})...`);
          }
        );

        const unshieldGasDetails: TransactionGasDetails = {
          evmGasType: EVMGasType.Type2,
          gasEstimate: unshieldGasEstimate,
          maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
        };

        const overallBatchMinGasPrice = calculateGasPrice(unshieldGasDetails);

        // Generate ZK proof for this recipient
        await withRetry(
          () => generateUnshieldProof(
            txidVersion,
            networkName,
            activeWalletID,
            senderEncryptionKey,
            unshieldRecipients,
            [],
            undefined,
            true,
            overallBatchMinGasPrice,
            (proofProgress) => {
              const pct = recipientProgressBase + (proofProgress / 100) * 15;
              progress('generating_proof', Math.floor(pct), `ZK proof ${i + 1}/${recipients.length}... ${proofProgress}%`);
            }
          ),
          `ZK proof for recipient ${i + 1}`,
          3,
          5000,
          (attempt, max) => {
            progress('generating_proof', Math.floor(recipientProgressBase), `Retrying proof (attempt ${attempt + 1}/${max})...`);
          }
        );

        console.log(`[BatchTransfer] ZK proof generated for recipient ${i + 1}/${recipients.length}`);

        // Unshield to this recipient
        progress('unshielding', Math.floor(recipientProgressBase + 15), `Unshielding to recipient ${i + 1}/${recipients.length}...`);

        const { transaction: unshieldTx } = await withRetry(
          () => populateProvedUnshield(
            txidVersion,
            networkName,
            activeWalletID,
            unshieldRecipients,
            [],
            undefined,
            true,
            overallBatchMinGasPrice,
            unshieldGasDetails
          ),
          `Populate unshield for recipient ${i + 1}`,
          3,
          2000
        );

        const unshieldTxResponse = await relayerWallet.sendTransaction(unshieldTx);
        console.log(`[BatchTransfer] Unshield TX for recipient ${i + 1}:`, unshieldTxResponse.hash);

        await unshieldTxResponse.wait();
        lastUnshieldTxHash = unshieldTxResponse.hash;

        // Update recipient result
        recipientResults[i].status = 'complete';
        recipientResults[i].unshieldTxHash = unshieldTxResponse.hash;

        console.log(`[BatchTransfer] Recipient ${i + 1}/${recipients.length} complete`);

        // CRITICAL: After each unshield, we need to wait for the SDK to recognize
        // the change notes before processing the next recipient. The unshield TX
        // creates new notes for remaining balance, but they need to be indexed.
        if (i < recipients.length - 1) {
          console.log(`[BatchTransfer] Waiting for balance update before next recipient...`);
          
          // Calculate expected remaining balance for next recipients
          let remainingRequired = BigInt(0);
          for (let j = i + 1; j < recipients.length; j++) {
            const nextRecipient = recipients[j];
            if (nextRecipient.tokenAddress.toLowerCase() === recipient.tokenAddress.toLowerCase()) {
              remainingRequired += BigInt(nextRecipient.amount);
            }
          }

          if (remainingRequired > 0) {
            const balanceWaitStart = Date.now();
            const maxBalanceWait = 30000; // 30 seconds max wait
            const balancePollInterval = 2000;
            let currentBalance = BigInt(0);
            
            // Account for shield fee on remaining amount
            const minExpectedBalance = (remainingRequired * BigInt(99)) / BigInt(100);

            while (currentBalance < minExpectedBalance && Date.now() - balanceWaitStart < maxBalanceWait) {
              await refreshBalances(chain, [activeWalletID]);
              await new Promise(r => setTimeout(r, balancePollInterval));
              
              const wallet = walletForID(activeWalletID);
              currentBalance = await balanceForERC20Token(
                txidVersion,
                wallet,
                networkName,
                recipient.tokenAddress,
                true // spendable only
              );
              
              const elapsed = Math.floor((Date.now() - balanceWaitStart) / 1000);
              console.log(`[BatchTransfer] Balance check: ${currentBalance.toString()} / ${minExpectedBalance.toString()} (${elapsed}s)`);
              
              progress(
                'generating_proof',
                Math.floor(recipientProgressBase + 18),
                `Syncing balance... ${elapsed}s`,
                undefined,
                undefined,
                { current: i, total: recipients.length }
              );
            }

            if (currentBalance < minExpectedBalance) {
              console.warn(`[BatchTransfer] Balance sync incomplete. Have: ${currentBalance.toString()}, Need: ${minExpectedBalance.toString()}`);
              // Continue anyway - the SDK might still have enough from change notes
            } else {
              console.log(`[BatchTransfer] Balance synced successfully for next recipient`);
            }
          } else {
            // No more recipients for this token, just do a quick refresh
            await refreshBalances(chain, [activeWalletID]);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      // ════════════════════════════════════════════════════════════════
      // COMPLETE
      // ════════════════════════════════════════════════════════════════
      progress('complete', 100, `Batch transfer complete! ${recipients.length} recipients`, lastUnshieldTxHash);
      console.log('[BatchTransfer] === BATCH GASLESS TRANSFER COMPLETE ===');
      console.log('[BatchTransfer] Recipients:', recipients.length);
      console.log('[BatchTransfer] Tokens:', tokenAddresses.length);
      console.log('[BatchTransfer] Last unshield TX:', lastUnshieldTxHash);

      return {
        success: true,
        shieldResults,
        unshieldTxHash: lastUnshieldTxHash,
        recipientResults,
        senderRailgunAddress,
        // Legacy compat - first shield TX
        shieldTxHash: shieldResults[0]?.shieldTxHash,
      };

    } catch (error) {
      console.error('[BatchTransfer] Failed:', error);
      
      // Create user-friendly error message
      let userMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Handle specific error cases with friendlier messages
      if (userMessage.includes('spendable private balance too low')) {
        userMessage = 'Balance sync failed. The RAILGUN network may be congested. Please try again in a few minutes.';
      } else if (userMessage.includes('Note already spent')) {
        userMessage = 'Transaction conflict detected. Please wait a moment and try again.';
      } else if (userMessage.includes('POI timeout')) {
        userMessage = 'Privacy verification timed out. The network may be slow. Please try again.';
      }
      
      progress('error', 0, userMessage);

      // Mark incomplete recipients as errored (keep completed ones)
      for (const result of recipientResults) {
        if (result.status !== 'complete') {
          result.status = 'error';
          result.error = userMessage;
        }
      }

      return {
        success: false,
        shieldResults,
        recipientResults,
        error: userMessage,
      };
    }
  }
}

export const railgunTransfer = RailgunTransferService.getInstance();
