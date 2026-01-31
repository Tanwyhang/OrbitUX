/**
 * Standardized Private Swap Service
 *
 * Privacy layer that can work with ANY DEX through adapters
 *
 * Flow:
 * 1. Execute permit (gasless approval)
 * 2. Pull tokens from user to relayer
 * 3. Shield tokens to RAILGUN
 * 4. Wait for POI (Proof of Innocence)
 * 5. Generate ZK proof and unshield to relayer
 * 6. Execute swap on ANY DEX via adapter
 * 7. Send output to user
 *
 * The key innovation: Privacy is a universal layer on top of DeFi
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
} from '../privateSwapTypes';
import type { IDexAdapter, DexSwapParams, DexQuote } from './adapters/DEXAdapter';

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

export type ProgressCallback = (progress: PrivateSwapProgress) => void;

interface StandardizedPrivateSwapParams {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputAmount: bigint;
  minimumOutput: bigint;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  permitData?: PermitData;
  slippage: number;
  dexAdapter: IDexAdapter;
  onProgress?: ProgressCallback;
}

/**
 * Standardized Private Swap Service
 *
 * Works with ANY DEX through the adapter interface
 */
class StandardizedPrivateSwapService {
  private static instance: StandardizedPrivateSwapService | null = null;

  private constructor() {}

  static getInstance(): StandardizedPrivateSwapService {
    if (!StandardizedPrivateSwapService.instance) {
      StandardizedPrivateSwapService.instance = new StandardizedPrivateSwapService();
    }
    return StandardizedPrivateSwapService.instance;
  }

  /**
   * Execute permit on-chain (relayer pays gas)
   */
  private async executePermit(
    tokenContract: Contract,
    permitData: PermitData
  ): Promise<string> {
    console.log('[StandardizedPrivateSwap] Executing permit on-chain...');

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
    console.log('[StandardizedPrivateSwap] Permit executed:', tx.hash);
    return tx.hash;
  }

  /**
   * Get quote from DEX adapter
   */
  async getDexQuote(
    params: DexSwapParams,
    dexAdapter: IDexAdapter
  ): Promise<DexQuote | null> {
    return await dexAdapter.getQuote(params);
  }

  /**
   * Execute a standardized private swap
   *
   * This works with ANY DEX through the adapter interface
   */
  async executePrivateSwap(params: StandardizedPrivateSwapParams): Promise<PrivateSwapResult> {
    const {
      senderWalletID,
      senderEncryptionKey: clientEncryptionKey,
      senderRailgunAddress,
      userAddress,
      inputTokenAddress,
      outputTokenAddress,
      inputAmount,
      minimumOutput,
      inputTokenDecimals,
      outputTokenDecimals,
      permitData,
      slippage,
      dexAdapter,
      onProgress,
    } = params;

    const result: PrivateSwapResult = { success: false };

    const progress = (step: PrivateSwapStep, pct: number, message: string, extra?: Partial<PrivateSwapProgress>) => {
      console.log(`[StandardizedPrivateSwap] ${step}: ${message} (${pct}%)`);
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
        console.log('[StandardizedPrivateSwap] Loading wallet...');
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

      // Get chain ID from provider (convert bigint to number)
      const chainId = Number((await provider.getNetwork()).chainId);

      console.log('[StandardizedPrivateSwap] === STANDARDIZED PRIVATE SWAP STARTED ===');
      console.log('[StandardizedPrivateSwap] DEX:', dexAdapter.name);
      console.log('[StandardizedPrivateSwap] Chain:', chainId);
      console.log('[StandardizedPrivateSwap] Input:', ethers.formatUnits(inputAmount, inputTokenDecimals), 'tokens');

      const inputTokenContract = new Contract(inputTokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);
      const outputTokenContract = new Contract(outputTokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);

      // Get DEX contract address
      const dexContractAddress = dexAdapter.getContractAddress(chainId);
      const dexContract = new Contract(
        dexContractAddress,
        dexAdapter.getContractABI(),
        relayerWallet
      );

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
      console.log('[StandardizedPrivateSwap] Tokens pulled from user');

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
        inputShieldTxHash: shieldTxResponse.hash,
      });
      await shieldTxResponse.wait();
      console.log('[StandardizedPrivateSwap] Input shield confirmed:', shieldTxResponse.hash);

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

      console.log('[StandardizedPrivateSwap] POI verified, spendable:', ethers.formatUnits(spendableBalance, inputTokenDecimals));

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Generate ZK proof and unshield to relayer
      // ════════════════════════════════════════════════════════════════
      progress('generating_proof_input', 45, 'Generating ZK proof...');

      const unshieldAmount = expectedAfterFee;

      const unshieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress: inputTokenAddress,
        amount: unshieldAmount,
        recipientAddress: relayerAddress, // Unshield to relayer for DEX swap
      }];

      const originalGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(0),
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      // Retry logic for gas estimation
      let unshieldGasEstimate = BigInt(0);
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const gasEstimateResponse = await gasEstimateForUnprovenUnshield(
            txidVersion,
            networkName,
            senderWalletID,
            senderEncryptionKey,
            unshieldRecipients,
            [],
            originalGasDetails,
            undefined,
            true
          );
          unshieldGasEstimate = gasEstimateResponse.gasEstimate;
          break;
        } catch (error) {
          if (attempt === maxRetries) throw error;
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }

      const unshieldGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: unshieldGasEstimate,
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      const overallBatchMinGasPrice = calculateGasPrice(unshieldGasDetails);

      await generateUnshieldProof(
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
      );

      console.log('[StandardizedPrivateSwap] ZK proof generated');

      // ════════════════════════════════════════════════════════════════
      // STEP 5: Unshield to relayer
      // ════════════════════════════════════════════════════════════════
      progress('unshielding_to_relayer', 62, 'Unshielding for swap...');

      // Retry logic for populate
      let unshieldTx;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const populated = await populateProvedUnshield(
            txidVersion,
            networkName,
            senderWalletID,
            unshieldRecipients,
            [],
            undefined,
            true,
            overallBatchMinGasPrice,
            unshieldGasDetails
          );
          unshieldTx = populated.transaction;
          break;
        } catch (error) {
          if (attempt === maxRetries) throw error;
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }

      if (!unshieldTx) {
        throw new Error('Failed to populate unshield transaction');
      }

      const unshieldTxResponse = await relayerWallet.sendTransaction(unshieldTx);
      console.log('[StandardizedPrivateSwap] Unshield TX sent:', unshieldTxResponse.hash);

      await unshieldTxResponse.wait();
      console.log('[StandardizedPrivateSwap] Unshield confirmed');

      // ════════════════════════════════════════════════════════════════
      // STEP 6: Execute swap on DEX (via adapter)
      // ════════════════════════════════════════════════════════════════
      progress('executing_swap', 70, `Executing swap on ${dexAdapter.name}...`);

      // Get fresh quote with actual amounts
      const dexParams: DexSwapParams = {
        inputTokenAddress,
        outputTokenAddress,
        inputAmount: unshieldAmount,
        minimumOutput,
        recipientAddress: userAddress,
        slippage,
      };

      const dexQuote = await this.getDexQuote(dexParams, dexAdapter);

      if (!dexQuote) {
        throw new Error('Failed to get DEX quote');
      }

      // Approve DEX contract to spend relayer's tokens
      const dexAllowance = await inputTokenContract.allowance(relayerAddress, dexContractAddress);
      if (dexAllowance < unshieldAmount) {
        const approveDexTx = await inputTokenContract.approve(dexContractAddress, ethers.MaxUint256);
        await approveDexTx.wait();
      }

      // Execute swap via DEX adapter
      const swapResult = await dexAdapter.executeSwap(
        dexContract,
        dexParams,
        dexQuote.dexSpecificData,
        unshieldGasDetails
      );

      if (!swapResult.success) {
        throw new Error(swapResult.error || 'DEX swap failed');
      }

      result.swapTxHash = swapResult.txHash;
      result.outputAmount = swapResult.outputAmount?.toString();

      progress('executing_swap', 85, 'Waiting for swap confirmation...', { swapTxHash: swapResult.txHash });

      console.log('[StandardizedPrivateSwap] Swap confirmed:', swapResult.txHash);

      // ════════════════════════════════════════════════════════════════
      // COMPLETE
      // ════════════════════════════════════════════════════════════════
      progress('complete', 100, `Private swap complete on ${dexAdapter.name}!`, {
        inputShieldTxHash: result.inputShieldTxHash,
        swapTxHash: result.swapTxHash,
      });

      console.log('[StandardizedPrivateSwap] === STANDARDIZED PRIVATE SWAP COMPLETE ===');
      console.log('[StandardizedPrivateSwap] Shield TX:', result.inputShieldTxHash);
      console.log('[StandardizedPrivateSwap] Swap TX:', result.swapTxHash);
      console.log('[StandardizedPrivateSwap] DEX:', dexAdapter.name);

      result.success = true;
      return result;

    } catch (error) {
      console.error('[StandardizedPrivateSwap] Failed:', error);
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
    request: PrivateSwapRequest & { dexAdapter: IDexAdapter; slippage: number; onProgress?: ProgressCallback }
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
    // Convert decimal strings to BigInt (e.g., "0.5" -> 500000 for 6 decimals)
    const inputAmountFloat = parseFloat(request.inputAmount);
    const inputAmountBigInt = BigInt(Math.floor(inputAmountFloat * (10 ** request.inputTokenDecimals)));

    const minimumOutputFloat = parseFloat(request.minimumOutput);
    const minimumOutputBigInt = BigInt(Math.floor(minimumOutputFloat * (10 ** request.outputTokenDecimals)));

    const swapPromise = this.executePrivateSwap({
      senderWalletID: request.senderWalletID,
      senderEncryptionKey: request.senderEncryptionKey,
      senderRailgunAddress: request.senderRailgunAddress,
      userAddress: request.userAddress,
      inputTokenAddress: request.inputTokenAddress,
      outputTokenAddress: request.outputTokenAddress,
      inputAmount: inputAmountBigInt,
      minimumOutput: minimumOutputBigInt,
      inputTokenDecimals: request.inputTokenDecimals,
      outputTokenDecimals: request.outputTokenDecimals,
      permitData: request.permitData,
      slippage: request.slippage,
      dexAdapter: request.dexAdapter,
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

export const standardizedPrivateSwapService = StandardizedPrivateSwapService.getInstance();
