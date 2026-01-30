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
  EIP7702Authorization 
} from "./types";

// Network config - RAILGUN proxy contract on Sepolia
// This is the contract that populateShield() sends tokens to
const RAILGUN_PROXY = "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea";

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
}

export const railgunTransfer = RailgunTransferService.getInstance();
