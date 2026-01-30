/**
 * Private Swap Service - Full Privacy Swap via RAILGUN
 * 
 * Flow:
 * 1. Execute permit (if provided) - relayer pays gas
 * 2. Pull tokens from user to relayer
 * 3. Shield input tokens -> sender's RAILGUN balance
 * 4. Wait for POI
 * 5. Generate ZK proof, unshield to relayer
 * 6. Relayer executes swap on pool
 * 7. Send output directly to user (simplified - no output shielding)
 * 
 * For failed swaps after input shielding: output goes directly to user as fallback.
 */

import { ethers, Contract } from 'ethers';
import {
  NetworkName,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG,
  type TransactionGasDetails,
  type RailgunERC20AmountRecipient,
} from '@railgun-community/shared-models';
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
} from '@railgun-community/wallet';
import { keccak256, toUtf8Bytes } from 'ethers';

import { railgunEngine } from '@/lib/railgun/engine';
import { relayerService } from '@/lib/railgun/relayer';
import { railgunWallet } from '@/lib/railgun/wallet';
import type { PermitData } from '@/lib/railgun/types';
import type { 
  PrivateSwapStep, 
  PrivateSwapProgress, 
  PrivateSwapResult,
  PrivateSwapRequest,
} from './privateSwapTypes';
import { POOL_ABI } from './config';

// RAILGUN proxy contract on Sepolia
const RAILGUN_PROXY = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';

// ERC20 ABI with permit
const ERC20_WITH_PERMIT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
];

// Pool ABI for swap
const POOL_CONTRACT_ABI = [
  'function swap(uint256 amount0In, uint256 amount1In, uint256 amount0OutMin, uint256 amount1OutMin, address to) returns (uint256 amount0Out, uint256 amount1Out)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

/**
 * Retry helper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  initialDelayMs: number = 2000
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        console.log(`[PrivateSwap] ${operationName} failed after ${maxRetries} attempts`);
        throw lastError;
      }
      
      console.log(`[PrivateSwap] ${operationName} attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }
  
  throw lastError || new Error(`${operationName} failed`);
}

export type ProgressCallback = (progress: PrivateSwapProgress) => void;

interface PrivateSwapParams {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputAmount: bigint;
  minimumOutput: bigint;
  poolAddress: string;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  permitData?: PermitData;
  onProgress?: ProgressCallback;
}

class PrivateSwapService {
  private static instance: PrivateSwapService | null = null;

  private constructor() {}

  static getInstance(): PrivateSwapService {
    if (!PrivateSwapService.instance) {
      PrivateSwapService.instance = new PrivateSwapService();
    }
    return PrivateSwapService.instance;
  }

  /**
   * Execute permit on-chain (relayer pays gas)
   */
  private async executePermit(
    tokenContract: Contract,
    permitData: PermitData
  ): Promise<string> {
    console.log('[PrivateSwap] Executing permit on-chain...');
    
    const tx = await tokenContract.permit(
      permitData.owner,
      permitData.spender,
      BigInt(permitData.value),
      BigInt(permitData.deadline),
      permitData.v,
      permitData.r,
      permitData.s,
      { gasLimit: 100000 }
    );

    const receipt = await tx.wait();
    console.log('[PrivateSwap] Permit executed:', tx.hash);
    return tx.hash;
  }

  /**
   * Execute a private swap
   */
  async executePrivateSwap(params: PrivateSwapParams): Promise<PrivateSwapResult> {
    const {
      senderWalletID,
      senderEncryptionKey: clientEncryptionKey,
      senderRailgunAddress,
      userAddress,
      inputTokenAddress,
      outputTokenAddress,
      inputAmount,
      minimumOutput,
      poolAddress,
      inputTokenDecimals,
      outputTokenDecimals,
      permitData,
      onProgress,
    } = params;

    const result: PrivateSwapResult = { success: false };

    const progress = (step: PrivateSwapStep, pct: number, message: string, extra?: Partial<PrivateSwapProgress>) => {
      console.log(`[PrivateSwap] ${step}: ${message} (${pct}%)`);
      onProgress?.({ step, progress: pct, message, ...extra });
    };

    try {
      // ════════════════════════════════════════════════════════════════
      // VALIDATION
      // ════════════════════════════════════════════════════════════════
      if (!railgunEngine.isReady()) {
        throw new Error('RAILGUN engine not initialized');
      }

      if (!relayerService.isConfigured()) {
        throw new Error('Relayer not configured');
      }

      // Get server-cached encryption key
      const cachedWallet = railgunWallet.getCachedWalletByID(senderWalletID);
      const senderEncryptionKey = cachedWallet?.encryptionKey || clientEncryptionKey;

      // Verify wallet exists
      let abstractWallet = walletForID(senderWalletID);
      if (!abstractWallet) {
        console.log('[PrivateSwap] Loading wallet...');
        await loadWalletByID(senderEncryptionKey, senderWalletID, false);
        abstractWallet = walletForID(senderWalletID);
      }

      if (!abstractWallet) {
        throw new Error('Wallet not found');
      }

      const networkName = railgunEngine.getNetwork();
      const txidVersion = railgunEngine.getTxidVersion();
      const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

      const relayerWallet = relayerService.getWallet();
      const provider = relayerService.getProvider();
      const relayerAddress = relayerWallet.address;

      console.log('[PrivateSwap] === PRIVATE SWAP STARTED ===');
      console.log('[PrivateSwap] Input:', ethers.formatUnits(inputAmount, inputTokenDecimals), 'tokens');
      console.log('[PrivateSwap] Min output:', ethers.formatUnits(minimumOutput, outputTokenDecimals), 'tokens');
      console.log('[PrivateSwap] Pool:', poolAddress);

      const inputTokenContract = new Contract(inputTokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);
      const outputTokenContract = new Contract(outputTokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);
      const poolContract = new Contract(poolAddress, POOL_CONTRACT_ABI, relayerWallet);

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Execute permit and pull tokens
      // ════════════════════════════════════════════════════════════════
      progress('approving', 5, 'Processing gasless approval...');

      if (permitData) {
        await this.executePermit(inputTokenContract, permitData);
      }

      // Verify allowance
      const userAllowance = await inputTokenContract.allowance(userAddress, relayerAddress);
      if (userAllowance < inputAmount) {
        throw new Error('Insufficient allowance');
      }

      // Pull tokens from user
      progress('approving', 8, 'Pulling tokens from wallet...');
      const transferFromTx = await inputTokenContract.transferFrom(
        userAddress,
        relayerAddress,
        inputAmount,
        { gasLimit: 100000 }
      );
      await transferFromTx.wait();
      console.log('[PrivateSwap] Tokens pulled from user');

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Approve RAILGUN and shield input tokens
      // ════════════════════════════════════════════════════════════════
      progress('shielding_input', 12, 'Approving RAILGUN...');

      const relayerAllowance = await inputTokenContract.allowance(relayerAddress, RAILGUN_PROXY);
      if (relayerAllowance < inputAmount) {
        const approveTx = await inputTokenContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
        await approveTx.wait();
      }

      progress('shielding_input', 15, 'Shielding input tokens...');

      const shieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress: inputTokenAddress,
        amount: inputAmount,
        recipientAddress: senderRailgunAddress,
      }];

      const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
      const shieldPrivateKey = keccak256(toUtf8Bytes(shieldSignatureMessage));
      const feeData = await provider.getFeeData();

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
      result.inputShieldTxHash = shieldTxResponse.hash;
      
      progress('shielding_input', 20, 'Waiting for shield confirmation...', { 
        inputShieldTxHash: shieldTxResponse.hash 
      });
      await shieldTxResponse.wait();
      console.log('[PrivateSwap] Input shield confirmed:', shieldTxResponse.hash);

      // ════════════════════════════════════════════════════════════════
      // STEP 3: Wait for POI
      // ════════════════════════════════════════════════════════════════
      progress('waiting_poi_input', 25, 'Waiting for privacy verification...');

      const SHIELD_FEE_BASIS_POINTS = BigInt(25); // 0.25%
      const shieldFee = (inputAmount * SHIELD_FEE_BASIS_POINTS) / BigInt(10000);
      const expectedAfterFee = inputAmount - shieldFee;
      const minExpectedBalance = (expectedAfterFee * BigInt(99)) / BigInt(100);

      let spendableBalance = BigInt(0);
      const maxWaitTime = 120000;
      const pollInterval = 5000;
      const startTime = Date.now();

      while (spendableBalance < minExpectedBalance && Date.now() - startTime < maxWaitTime) {
        await new Promise(r => setTimeout(r, pollInterval));
        await refreshBalances(chain, [senderWalletID]);

        const wallet = walletForID(senderWalletID);
        spendableBalance = await balanceForERC20Token(
          txidVersion,
          wallet,
          networkName,
          inputTokenAddress,
          true
        );

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const pct = Math.min(25 + Math.floor(elapsed / 3), 40);
        progress('waiting_poi_input', pct, `Privacy verification... ${elapsed}s`);
      }

      if (spendableBalance < minExpectedBalance) {
        throw new Error('POI verification timeout');
      }

      console.log('[PrivateSwap] POI verified, spendable:', ethers.formatUnits(spendableBalance, inputTokenDecimals));

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Generate ZK proof and unshield to relayer
      // ════════════════════════════════════════════════════════════════
      progress('generating_proof_input', 45, 'Generating ZK proof...');

      const unshieldAmount = expectedAfterFee;

      const unshieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress: inputTokenAddress,
        amount: unshieldAmount,
        recipientAddress: relayerAddress, // Unshield to relayer for swap
      }];

      const originalGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(0),
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

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
        3,
        3000
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
            const pct = 50 + Math.floor(proofProgress * 0.1);
            progress('generating_proof_input', pct, `Generating proof... ${proofProgress}%`);
          }
        ),
        'ZK proof generation',
        3,
        5000
      );

      console.log('[PrivateSwap] ZK proof generated');

      // ════════════════════════════════════════════════════════════════
      // STEP 5: Unshield to relayer
      // ════════════════════════════════════════════════════════════════
      progress('unshielding_to_relayer', 62, 'Unshielding for swap...');

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
        'Populate unshield',
        3,
        2000
      );

      const unshieldTxResponse = await relayerWallet.sendTransaction(unshieldTx);
      console.log('[PrivateSwap] Unshield TX sent:', unshieldTxResponse.hash);

      await unshieldTxResponse.wait();
      console.log('[PrivateSwap] Unshield confirmed');

      // ════════════════════════════════════════════════════════════════
      // STEP 6: Execute swap on pool
      // ════════════════════════════════════════════════════════════════
      progress('executing_swap', 70, 'Executing swap...');

      // Approve pool to spend relayer's input tokens
      const poolAllowance = await inputTokenContract.allowance(relayerAddress, poolAddress);
      if (poolAllowance < unshieldAmount) {
        const approvePoolTx = await inputTokenContract.approve(poolAddress, ethers.MaxUint256);
        await approvePoolTx.wait();
      }

      // Determine swap direction
      const token0Address = await poolContract.token0() as string;
      const isToken0 = inputTokenAddress.toLowerCase() === token0Address.toLowerCase();

      // Execute swap - output goes directly to user
      const swapTx = await poolContract.swap(
        isToken0 ? unshieldAmount : BigInt(0),
        isToken0 ? BigInt(0) : unshieldAmount,
        isToken0 ? BigInt(0) : minimumOutput,
        isToken0 ? minimumOutput : BigInt(0),
        userAddress, // Output goes directly to user (simplified - no output shielding)
        { gasLimit: 300000 }
      );

      result.swapTxHash = swapTx.hash;
      progress('executing_swap', 85, 'Waiting for swap confirmation...', { swapTxHash: swapTx.hash });

      const swapReceipt = await swapTx.wait();
      console.log('[PrivateSwap] Swap confirmed:', swapTx.hash);

      // ════════════════════════════════════════════════════════════════
      // COMPLETE
      // ════════════════════════════════════════════════════════════════
      progress('complete', 100, 'Private swap complete!', {
        inputShieldTxHash: result.inputShieldTxHash,
        swapTxHash: result.swapTxHash,
      });

      console.log('[PrivateSwap] === PRIVATE SWAP COMPLETE ===');
      console.log('[PrivateSwap] Shield TX:', result.inputShieldTxHash);
      console.log('[PrivateSwap] Swap TX:', result.swapTxHash);

      result.success = true;
      return result;

    } catch (error) {
      console.error('[PrivateSwap] Failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      progress('error', 0, errorMessage, { error: errorMessage });
      result.error = errorMessage;
      return result;
    }
  }

  /**
   * Execute private swap as an async generator for SSE streaming
   */
  async *executePrivateSwapStream(
    request: PrivateSwapRequest
  ): AsyncGenerator<PrivateSwapProgress> {
    const progressQueue: PrivateSwapProgress[] = [];
    let resolveWait: (() => void) | null = null;
    let isComplete = false;

    const onProgress = (progress: PrivateSwapProgress) => {
      progressQueue.push(progress);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
      if (progress.step === 'complete' || progress.step === 'error') {
        isComplete = true;
      }
    };

    // Start the swap in background
    const swapPromise = this.executePrivateSwap({
      senderWalletID: request.senderWalletID,
      senderEncryptionKey: request.senderEncryptionKey,
      senderRailgunAddress: request.senderRailgunAddress,
      userAddress: request.userAddress,
      inputTokenAddress: request.inputTokenAddress,
      outputTokenAddress: request.outputTokenAddress,
      inputAmount: BigInt(request.inputAmount),
      minimumOutput: BigInt(request.minimumOutput),
      poolAddress: request.poolAddress,
      inputTokenDecimals: request.inputTokenDecimals,
      outputTokenDecimals: request.outputTokenDecimals,
      permitData: request.permitData,
      onProgress,
    });

    // Yield progress updates as they come
    while (!isComplete) {
      if (progressQueue.length > 0) {
        yield progressQueue.shift()!;
      } else {
        // Wait for next progress update
        await new Promise<void>(resolve => {
          resolveWait = resolve;
          // Timeout to check completion
          setTimeout(resolve, 1000);
        });
      }
    }

    // Yield any remaining updates
    while (progressQueue.length > 0) {
      yield progressQueue.shift()!;
    }

    // Wait for swap to complete
    await swapPromise;
  }
}

export const privateSwapService = PrivateSwapService.getInstance();
