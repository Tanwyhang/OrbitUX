/**
 * Private Bridge Service
 *
 * Orchestrates private cross-chain transfers with end-to-end privacy:
 * 1. Source chain: shield → POI → ZK proof → unshield to relayer
 * 2. Cross-chain: relayer executes bridge via adapter
 * 3. Destination chain: receive and shield to private balance
 */

import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
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
  getShieldPrivateKeySignatureMessage,
  gasEstimateForShield,
  populateShield,
  gasEstimateForUnprovenUnshield,
  generateUnshieldProof,
  populateProvedUnshield,
} from '@railgun-community/wallet';
import { keccak256, toUtf8Bytes } from 'ethers';

import type { SupportedChainId } from '@/lib/swap/unifiedConfig';
import { multiChainRailgunEngine } from '@/lib/railgun/multiChainEngine';
import { relayerService } from '@/lib/railgun/relayer';
import type { PermitData } from '@/lib/railgun/types';
import type {
  PrivateBridgeStep,
  PrivateBridgeProgress,
  PrivateBridgeResult,
  PrivateBridgeRequest,
  IBridgeAdapter,
  DestinationDelivery,
} from '@/lib/swap/privateBridgeTypes';

// RAILGUN proxy contract
const RAILGUN_PROXY = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea';

// ERC20 ABI for permit
const ERC20_WITH_PERMIT_ABI = [
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
];

export type ProgressCallback = (progress: PrivateBridgeProgress) => void;

interface PrivateBridgeParams {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  userAddress: string;
  sourceChainId: SupportedChainId;
  inputTokenAddress: string;
  inputAmount: bigint;
  inputTokenDecimals: number;
  destinationChainId: SupportedChainId;
  outputTokenAddress?: string;
  minimumOutput?: bigint;
  mode: 'bridge_only' | 'bridge_and_swap';
  destinationDelivery: DestinationDelivery;
  permitData?: PermitData;
  slippage: number;
  bridgeAdapter: IBridgeAdapter;
  onProgress?: ProgressCallback;
}

/**
 * Private Bridge Service
 *
 * Orchestrates private cross-chain transfers
 */
class PrivateBridgeService {
  private static instance: PrivateBridgeService | null = null;

  private constructor() {}

  static getInstance(): PrivateBridgeService {
    if (!PrivateBridgeService.instance) {
      PrivateBridgeService.instance = new PrivateBridgeService();
    }
    return PrivateBridgeService.instance;
  }

  /**
   * Execute a private bridge with end-to-end privacy
   */
  async executePrivateBridge(params: PrivateBridgeParams): Promise<PrivateBridgeResult> {
    const {
      senderWalletID,
      senderEncryptionKey,
      senderRailgunAddress,
      userAddress,
      sourceChainId,
      inputTokenAddress,
      inputAmount,
      inputTokenDecimals,
      destinationChainId,
      outputTokenAddress,
      minimumOutput,
      mode,
      destinationDelivery,
      permitData,
      slippage,
      bridgeAdapter,
      onProgress,
    } = params;

    const result: PrivateBridgeResult = {
      success: false,
      sourceChainId,
      destinationChainId,
    };

    const progress = (step: PrivateBridgeStep, pct: number, message: string, extra?: Partial<PrivateBridgeProgress>) => {
      console.log(`[PrivateBridge] ${step}: ${message} (${pct}%)`);
      onProgress?.({
        step,
        progress: pct,
        message,
        sourceChainId,
        destinationChainId,
        ...extra
      });
    };

    try {
      // ════════════════════════════════════════════════════════════════
      // VALIDATION
      // ════════════════════════════════════════════════════════════════
      if (!relayerService.isConfigured()) {
        throw new Error('Relayer not configured');
      }

      // Initialize source chain engine
      progress('preparing', 5, 'Initializing privacy engine...');
      await multiChainRailgunEngine.initChain(sourceChainId);

      const sourceNetworkName = multiChainRailgunEngine.getNetworkName(sourceChainId);

      // Load wallet on source chain
      await multiChainRailgunEngine.loadWalletOnChain(sourceChainId, senderEncryptionKey, senderWalletID);

      // Get relayer wallet and provider
      const relayerWallet = relayerService.getWallet();
      const provider = relayerService.getProvider();
      const relayerAddress = relayerWallet.address;

      console.log('[PrivateBridge] === PRIVATE BRIDGE STARTED ===');
      console.log('[PrivateBridge] Source:', sourceChainId, 'Destination:', destinationChainId);
      console.log('[PrivateBridge] Mode:', mode, 'Delivery:', destinationDelivery);

      const inputTokenContract = new Contract(inputTokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Execute permit and pull tokens
      // ════════════════════════════════════════════════════════════════
      progress('approving', 10, 'Processing gasless approval...');

      if (permitData) {
        await this.executePermit(inputTokenContract, permitData);
      }

      // Pull tokens from user
      progress('approving', 12, 'Pulling tokens from wallet...');
      const transferFromTx = await inputTokenContract.transferFrom(
        userAddress,
        relayerAddress,
        inputAmount,
        { gasLimit: 100000 }
      );
      await transferFromTx.wait();

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Approve RAILGUN and shield input tokens
      // ════════════════════════════════════════════════════════════════
      progress('shielding_input', 15, 'Approving RAILGUN...');

      const relayerAllowance = await inputTokenContract.allowance(relayerAddress, RAILGUN_PROXY);
      if (relayerAllowance < inputAmount) {
        const approveTx = await inputTokenContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
        await approveTx.wait();
      }

      progress('shielding_input', 18, 'Shielding tokens privately...');

      const shieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress: inputTokenAddress,
        amount: inputAmount,
        recipientAddress: senderRailgunAddress,
      }];

      const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
      const shieldPrivateKey = keccak256(toUtf8Bytes(shieldSignatureMessage));
      const feeData = await provider.getFeeData();

      // L2-specific gas price adjustments (L2s are much cheaper than mainnet)
      const isL2 = sourceChainId === 42161 || sourceChainId === 137; // Arbitrum or Polygon
      const defaultMaxFee = isL2 ? BigInt(0.1 * 10 ** 9) : BigInt(50 * 10 ** 9); // 0.1 gwei for L2, 50 gwei for L1
      const defaultPriorityFee = isL2 ? BigInt(0.01 * 10 ** 9) : BigInt(2 * 10 ** 9); // 0.01 gwei for L2, 2 gwei for L1

      const { gasEstimate: shieldGasEstimate } = await gasEstimateForShield(
        TXIDVersion.V2_PoseidonMerkle,
        sourceNetworkName,
        shieldPrivateKey,
        shieldRecipients,
        [],
        relayerAddress
      );

      const shieldGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: shieldGasEstimate,
        maxFeePerGas: feeData.maxFeePerGas ?? defaultMaxFee,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? defaultPriorityFee,
      };

      const { transaction: shieldTx } = await populateShield(
        TXIDVersion.V2_PoseidonMerkle,
        sourceNetworkName,
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

      // ════════════════════════════════════════════════════════════════
      // STEP 3: Wait for POI
      // ════════════════════════════════════════════════════════════════
      progress('waiting_poi_input', 25, 'Verifying privacy...');

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
        await refreshBalances(RAILGUN_NETWORK_CONFIG[sourceNetworkName].chain, [senderWalletID]);

        const wallet = walletForID(senderWalletID);
        spendableBalance = await balanceForERC20Token(
          TXIDVersion.V2_PoseidonMerkle,
          wallet,
          sourceNetworkName,
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

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Generate ZK proof and unshield to relayer
      // ════════════════════════════════════════════════════════════════
      progress('generating_proof_input', 45, 'Generating ZK proof...');

      const unshieldAmount = expectedAfterFee;

      const unshieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress: inputTokenAddress,
        amount: unshieldAmount,
        recipientAddress: relayerAddress,
      }];

      const originalGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(0),
        maxFeePerGas: feeData.maxFeePerGas ?? defaultMaxFee,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? defaultPriorityFee,
      };

      let unshieldGasEstimate = BigInt(0);
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const gasEstimateResponse = await gasEstimateForUnprovenUnshield(
            TXIDVersion.V2_PoseidonMerkle,
            sourceNetworkName,
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
        maxFeePerGas: feeData.maxFeePerGas ?? defaultMaxFee,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? defaultPriorityFee,
      };

      const overallBatchMinGasPrice = calculateGasPrice(unshieldGasDetails);

      await generateUnshieldProof(
        TXIDVersion.V2_PoseidonMerkle,
        sourceNetworkName,
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

      // ════════════════════════════════════════════════════════════════
      // STEP 5: Unshield to relayer
      // ════════════════════════════════════════════════════════════════
      progress('unshielding_to_relayer', 62, 'Unshielding for bridge...');

      let unshieldTx;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const populated = await populateProvedUnshield(
            TXIDVersion.V2_PoseidonMerkle,
            sourceNetworkName,
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
      result.unshieldTxHash = unshieldTxResponse.hash;
      await unshieldTxResponse.wait();

      // ════════════════════════════════════════════════════════════════
      // STEP 6: Execute bridge via adapter
      // ════════════════════════════════════════════════════════════════
      progress('executing_bridge', 65, 'Executing cross-chain bridge...');

      const bridgeQuote = await bridgeAdapter.getQuote({
        sourceChainId,
        destinationChainId,
        inputTokenAddress,
        outputTokenAddress,
        inputAmount: unshieldAmount,
        slippage,
      });

      if (!bridgeQuote) {
        throw new Error('Failed to get bridge quote');
      }

      // Approve bridge router
      const bridgeRouterAddress = '0x8731d54E9D02c286767d56ac03e8037C07e01e98';
      const bridgeAllowance = await inputTokenContract.allowance(relayerAddress, bridgeRouterAddress);
      if (bridgeAllowance < unshieldAmount) {
        const approveBridgeTx = await inputTokenContract.approve(bridgeRouterAddress, ethers.MaxUint256);
        await approveBridgeTx.wait();
      }

      // Execute bridge with proper gas estimation
      // Bridges have much lower gas requirements than shields
      const bridgeGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(300000), // Bridge gas limit (much lower than shield)
        maxFeePerGas: feeData.maxFeePerGas ?? defaultMaxFee,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? defaultPriorityFee,
      };

      const bridgeResult = await bridgeAdapter.executeBridge({
        sourceChainId,
        destinationChainId,
        inputTokenAddress,
        outputTokenAddress,
        inputAmount: unshieldAmount,
        minimumOutput: minimumOutput || bridgeQuote.minimumOutput,
        recipientAddress: userAddress,
      }, bridgeGasDetails);

      if (!bridgeResult.success) {
        throw new Error(bridgeResult.error || 'Bridge execution failed');
      }

      result.bridgeTxHash = bridgeResult.txHash;
      progress('executing_bridge', 70, 'Bridge transaction submitted...', {
        bridgeTxHash: bridgeResult.txHash,
      });

      // ════════════════════════════════════════════════════════════════
      // STEP 7: Wait for cross-chain bridge completion
      // ════════════════════════════════════════════════════════════════
      progress('waiting_bridge', 75, 'Cross-chain transfer in progress...');

      const bridgeDelivery = await bridgeAdapter.waitForBridge(
        bridgeResult.txHash!,
        sourceChainId,
        destinationChainId
      );

      if (!bridgeDelivery.success) {
        throw new Error(bridgeDelivery.error || 'Bridge delivery failed');
      }

      progress('bridge_confirmed', 80, 'Bridge confirmed, processing delivery...');

      // ════════════════════════════════════════════════════════════════
      // STEP 8: Destination delivery
      // ════════════════════════════════════════════════════════════════

      if (destinationDelivery === 'private') {
        // End-to-end privacy: Shield on destination chain
        await this.executeDestinationShielding({
          destinationChainId,
          senderWalletID,
          senderEncryptionKey,
          receivedAmount: bridgeDelivery.outputAmount,
          receivedTokenAddress: bridgeDelivery.outputTokenAddress,
          userAddress,
          progress,
          result,
        });
      } else {
        // Public delivery: tokens already at user's address
        progress('complete', 100, 'Bridge complete! Tokens delivered to public address.');
        result.outputAmount = bridgeDelivery.outputAmount.toString();
      }

      console.log('[PrivateBridge] === PRIVATE BRIDGE COMPLETE ===');
      result.success = true;
      return result;

    } catch (error) {
      console.error('[PrivateBridge] Failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      progress('error', 0, errorMessage, { error: errorMessage });
      result.error = errorMessage;
      return result;
    }
  }

  /**
   * Execute destination shielding for end-to-end privacy
   */
  private async executeDestinationShielding(params: {
    destinationChainId: SupportedChainId;
    senderWalletID: string;
    senderEncryptionKey: string;
    receivedAmount: bigint;
    receivedTokenAddress: string;
    userAddress: string;
    progress: (step: PrivateBridgeStep, pct: number, msg: string, extra?: Partial<PrivateBridgeProgress>) => void;
    result: PrivateBridgeResult;
  }): Promise<void> {
    const { destinationChainId, senderWalletID, senderEncryptionKey, receivedAmount, receivedTokenAddress, userAddress, progress, result } = params;

    progress('dest_shielding', 85, 'Shielding on destination chain...');

    // Initialize destination chain engine
    await multiChainRailgunEngine.initChain(destinationChainId);
    const destNetworkName = multiChainRailgunEngine.getNetworkName(destinationChainId);

    // Load wallet on destination chain
    await multiChainRailgunEngine.loadWalletOnChain(destinationChainId, senderEncryptionKey, senderWalletID);

    // Get the RAILGUN address on destination chain
    // We need to get it from the wallet directly
    const { walletForID } = await import("@railgun-community/wallet");
    const destWallet = walletForID(senderWalletID);
    // @ts-ignore - railgunAddress might not be directly exported
    const destRailgunAddress = destWallet?.railgunWalletAddress || destWallet?.railgunAddress;

    console.log('[PrivateBridge] Destination RAILGUN address:', destRailgunAddress);

    // Get relayer wallet for destination chain
    const relayerWallet = relayerService.getWallet();
    const provider = relayerService.getProvider();
    const relayerAddress = relayerWallet.address;

    // Check if user has tokens at their public address
    const tokenContract = new Contract(receivedTokenAddress, ERC20_WITH_PERMIT_ABI, relayerWallet);
    const userBalance = await tokenContract.balanceOf(userAddress);

    if (userBalance < receivedAmount) {
      console.warn('[PrivateBridge] User balance less than expected, using available balance');
    }

    const actualAmount = userBalance;

    // Transfer tokens from user's public address to relayer
    progress('dest_shielding', 86, 'Preparing destination shield...');
    const transferTx = await tokenContract.transferFrom(
      userAddress,
      relayerAddress,
      actualAmount,
      { gasLimit: 100000 }
    );
    await transferTx.wait();

    // Approve RAILGUN on destination
    progress('dest_shielding', 87, 'Approving RAILGUN on destination...');
    const allowance = await tokenContract.allowance(relayerAddress, RAILGUN_PROXY);
    if (allowance < actualAmount) {
      const approveTx = await tokenContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
      await approveTx.wait();
    }

    // Shield tokens on destination chain
    progress('dest_shielding', 88, 'Shielding tokens to private balance...');

    const shieldRecipients: RailgunERC20AmountRecipient[] = [{
      tokenAddress: receivedTokenAddress,
      amount: actualAmount,
      recipientAddress: destRailgunAddress,
    }];

    const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
    const shieldPrivateKey = keccak256(toUtf8Bytes(shieldSignatureMessage));
    const feeData = await provider.getFeeData();

    // Check if destination is L2 for proper gas pricing
    const isDestL2 = destinationChainId === 42161 || destinationChainId === 137;
    const destDefaultMaxFee = isDestL2 ? BigInt(0.1 * 10 ** 9) : BigInt(50 * 10 ** 9);
    const destDefaultPriorityFee = isDestL2 ? BigInt(0.01 * 10 ** 9) : BigInt(2 * 10 ** 9);

    const { gasEstimate: shieldGasEstimate } = await gasEstimateForShield(
      TXIDVersion.V2_PoseidonMerkle,
      destNetworkName,
      shieldPrivateKey,
      shieldRecipients,
      [],
      relayerAddress
    );

    const shieldGasDetails: TransactionGasDetails = {
      evmGasType: EVMGasType.Type2,
      gasEstimate: shieldGasEstimate,
      maxFeePerGas: feeData.maxFeePerGas ?? destDefaultMaxFee,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? destDefaultPriorityFee,
    };

    const { transaction: shieldTx } = await populateShield(
      TXIDVersion.V2_PoseidonMerkle,
      destNetworkName,
      shieldPrivateKey,
      shieldRecipients,
      [],
      shieldGasDetails
    );

    const shieldTxResponse = await relayerWallet.sendTransaction(shieldTx);
    result.destShieldTxHash = shieldTxResponse.hash;

    progress('dest_shielding', 90, 'Waiting for destination shield confirmation...');
    await shieldTxResponse.wait();

    // Wait for destination POI
    progress('waiting_poi_dest', 92, 'Verifying destination privacy...');

    const SHIELD_FEE_BASIS_POINTS = BigInt(25);
    const shieldFee = (actualAmount * SHIELD_FEE_BASIS_POINTS) / BigInt(10000);
    const expectedAfterFee = actualAmount - shieldFee;
    const minExpectedBalance = (expectedAfterFee * BigInt(99)) / BigInt(100);

    let spendableBalance = BigInt(0);
    const maxWaitTime = 120000;
    const pollInterval = 5000;
    const startTime = Date.now();

    while (spendableBalance < minExpectedBalance && Date.now() - startTime < maxWaitTime) {
      await new Promise(r => setTimeout(r, pollInterval));
      await refreshBalances(RAILGUN_NETWORK_CONFIG[destNetworkName].chain, [senderWalletID]);

      spendableBalance = await balanceForERC20Token(
        TXIDVersion.V2_PoseidonMerkle,
        destWallet,
        destNetworkName,
        receivedTokenAddress,
        true
      );

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0) {
        progress('waiting_poi_dest', 92 + Math.floor(elapsed / 10), `Destination privacy verification... ${elapsed}s`);
      }
    }

    if (spendableBalance < minExpectedBalance) {
      throw new Error('Destination POI verification timeout');
    }

    progress('complete', 100, 'End-to-end private bridge complete!');
    result.outputAmount = spendableBalance.toString();
  }

  /**
   * Execute permit on-chain
   */
  private async executePermit(
    tokenContract: Contract,
    permitData: PermitData
  ): Promise<string> {
    console.log('[PrivateBridge] Executing permit...');

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
    return tx.hash;
  }

  /**
   * Execute private bridge as async generator for SSE streaming
   */
  async *executePrivateBridgeStream(
    request: PrivateBridgeRequest & { bridgeAdapter: IBridgeAdapter }
  ): AsyncGenerator<PrivateBridgeProgress> {
    const progressQueue: PrivateBridgeProgress[] = [];
    let resolveWait: (() => void) | null = null;
    let isComplete = false;

    const onProgress = (progress: PrivateBridgeProgress) => {
      progressQueue.push(progress);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
      if (progress.step === 'complete' || progress.step === 'error') {
        isComplete = true;
      }
    };

    // Start bridge in background
    // Convert decimal string to BigInt (e.g., "0.5" -> 500000 for 6 decimals)
    const amountFloat = parseFloat(request.inputAmount);
    const amountBigInt = BigInt(Math.floor(amountFloat * (10 ** request.inputTokenDecimals)));

    const bridgePromise = this.executePrivateBridge({
      ...request,
      bridgeAdapter: request.bridgeAdapter,
      onProgress,
      inputAmount: amountBigInt,
      minimumOutput: request.minimumOutput ? BigInt(Math.floor(parseFloat(request.minimumOutput) * (10 ** request.inputTokenDecimals))) : undefined,
    });

    // Yield progress updates
    while (!isComplete) {
      if (progressQueue.length > 0) {
        yield progressQueue.shift()!;
      } else {
        await new Promise<void>(resolve => {
          resolveWait = resolve;
          setTimeout(resolve, 1000);
        });
      }
    }

    while (progressQueue.length > 0) {
      yield progressQueue.shift()!;
    }

    await bridgePromise;
  }
}

export const privateBridgeService = PrivateBridgeService.getInstance();
