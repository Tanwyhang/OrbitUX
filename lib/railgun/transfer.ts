/**
 * Server-side RAILGUN Transfer Service
 * 
 * Complete private transfer flow (abstracted as public-to-public):
 * 
 * 1. Approve tokens for RAILGUN proxy
 * 2. Shield tokens (sender public → sender private)
 * 3. Wait for POI verification (~60s)
 * 4. Generate ZK proof for unshield
 * 5. Unshield to recipient (sender private → recipient public)
 * 
 * From user perspective: looks like a normal transfer from sender to recipient,
 * but the middle steps are private and unlinkable on-chain.
 */

import { ethers, Wallet as EthersWallet, JsonRpcProvider, Contract } from "ethers";
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
  getShieldPrivateKeySignatureMessage,
  gasEstimateForShield,
  populateShield,
  gasEstimateForUnprovenUnshield,
  generateUnshieldProof,
  populateProvedUnshield,
} from "@railgun-community/wallet";
import { keccak256, toUtf8Bytes } from "ethers";
import { railgunEngine } from "./engine";
import { railgunWallet } from "./wallet";
import type { TransferStep, TransferProgress } from "./types";

// Network config
const RPC_URL = process.env.RAILGUN_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/lO9FWaEPl-y8mMJHInELW";
const RAILGUN_PROXY = "0x19b620929f97b7b990801496c3b361ca5def8c71";

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

export type ProgressCallback = (progress: TransferProgress) => void;

interface TransferParams {
  senderWalletID: string;
  senderEncryptionKey: string;
  senderRailgunAddress: string;
  recipientPublicAddress: string;
  tokenAddress: string;
  amount: bigint;
  signerPrivateKey: string;
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
   * Execute a complete private transfer.
   * 
   * Flow: Sender Public → Shield → Private Balance → Unshield → Recipient Public
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
      senderEncryptionKey,
      senderRailgunAddress,
      recipientPublicAddress,
      tokenAddress,
      amount,
      signerPrivateKey,
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

      const networkName = railgunEngine.getNetwork();
      const txidVersion = railgunEngine.getTxidVersion();
      const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

      // Create signer wallet
      const provider = new JsonRpcProvider(RPC_URL);
      const signerWallet = new EthersWallet(signerPrivateKey, provider);
      
      console.log('[Transfer] Signer address:', signerWallet.address);
      console.log('[Transfer] Amount:', ethers.formatUnits(amount, 6), 'USDC');
      console.log('[Transfer] Recipient:', recipientPublicAddress);

      // ════════════════════════════════════════════════════════════════
      // STEP 1: Approve tokens for RAILGUN proxy
      // ════════════════════════════════════════════════════════════════
      progress('approving', 5, 'Checking token allowance...');

      const tokenContract = new Contract(tokenAddress, ERC20_ABI, signerWallet);
      const currentAllowance = await tokenContract.allowance(signerWallet.address, RAILGUN_PROXY);

      if (currentAllowance < amount) {
        progress('approving', 10, 'Approving tokens for RAILGUN...');
        const approveTx = await tokenContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
        await approveTx.wait();
        console.log('[Transfer] Approval confirmed');
      } else {
        console.log('[Transfer] Already approved');
      }

      // ════════════════════════════════════════════════════════════════
      // STEP 2: Shield tokens (public → private)
      // ════════════════════════════════════════════════════════════════
      progress('shielding', 15, 'Preparing shield transaction...');

      const shieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress,
        amount,
        recipientAddress: senderRailgunAddress, // Shield to sender's own RAILGUN wallet
      }];

      // Generate shield private key
      const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
      const shieldPrivateKey = keccak256(toUtf8Bytes(shieldSignatureMessage));

      // Estimate gas for shield
      const { gasEstimate: shieldGasEstimate } = await gasEstimateForShield(
        txidVersion,
        networkName,
        shieldPrivateKey,
        shieldRecipients,
        [], // NFTs
        signerWallet.address
      );

      // Get gas details
      const feeData = await provider.getFeeData();
      const shieldGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: shieldGasEstimate,
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      // Populate shield transaction
      const { transaction: shieldTx } = await populateShield(
        txidVersion,
        networkName,
        shieldPrivateKey,
        shieldRecipients,
        [], // NFTs
        shieldGasDetails
      );

      progress('shielding', 20, 'Sending shield transaction...');
      const shieldTxResponse = await signerWallet.sendTransaction(shieldTx);
      console.log('[Transfer] Shield TX sent:', shieldTxResponse.hash);

      progress('shielding', 25, 'Waiting for shield confirmation...', shieldTxResponse.hash);
      await shieldTxResponse.wait();
      console.log('[Transfer] Shield confirmed');

      // ════════════════════════════════════════════════════════════════
      // STEP 3: Wait for POI verification
      // ════════════════════════════════════════════════════════════════
      progress('waiting_poi', 30, 'Waiting for Proof of Innocence verification...');

      // POI verification typically takes 60-90 seconds
      // We poll the balance until spendable balance appears
      let spendableBalance = BigInt(0);
      const maxWaitTime = 120000; // 2 minutes max
      const pollInterval = 5000; // 5 seconds
      const startTime = Date.now();

      while (spendableBalance < amount && Date.now() - startTime < maxWaitTime) {
        await new Promise(r => setTimeout(r, pollInterval));
        
        // Refresh balances
        await refreshBalances(chain, [senderWalletID]);
        
        const abstractWallet = walletForID(senderWalletID);
        spendableBalance = await balanceForERC20Token(
          txidVersion,
          abstractWallet,
          networkName,
          tokenAddress,
          true // onlySpendable
        );

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const progressPct = Math.min(30 + Math.floor(elapsed / 2), 45);
        progress('waiting_poi', progressPct, `POI verification... ${elapsed}s elapsed`);
        
        console.log(`[Transfer] Spendable balance: ${ethers.formatUnits(spendableBalance, 6)} USDC`);
      }

      if (spendableBalance < amount) {
        throw new Error(`POI verification timeout. Spendable: ${ethers.formatUnits(spendableBalance, 6)}, Need: ${ethers.formatUnits(amount, 6)}`);
      }

      console.log('[Transfer] POI verified, balance is spendable');

      // ════════════════════════════════════════════════════════════════
      // STEP 4: Generate ZK proof for unshield
      // ════════════════════════════════════════════════════════════════
      progress('generating_proof', 50, 'Generating ZK proof (20-40 seconds)...');

      const unshieldRecipients: RailgunERC20AmountRecipient[] = [{
        tokenAddress,
        amount,
        recipientAddress: recipientPublicAddress, // Unshield to recipient's public address
      }];

      // Estimate gas for unshield
      const originalGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: BigInt(0),
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      const { gasEstimate: unshieldGasEstimate } = await gasEstimateForUnprovenUnshield(
        txidVersion,
        networkName,
        senderWalletID,
        senderEncryptionKey,
        unshieldRecipients,
        [], // NFTs
        originalGasDetails,
        undefined, // No broadcaster fee
        true // sendWithPublicWallet
      );

      const unshieldGasDetails: TransactionGasDetails = {
        evmGasType: EVMGasType.Type2,
        gasEstimate: unshieldGasEstimate,
        maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
      };

      const overallBatchMinGasPrice = calculateGasPrice(unshieldGasDetails);

      // Generate proof
      await generateUnshieldProof(
        txidVersion,
        networkName,
        senderWalletID,
        senderEncryptionKey,
        unshieldRecipients,
        [], // NFTs
        undefined, // No broadcaster fee
        true, // sendWithPublicWallet
        overallBatchMinGasPrice,
        (proofProgress) => {
          const pct = 50 + Math.floor(proofProgress * 0.3);
          progress('generating_proof', pct, `Generating ZK proof... ${proofProgress}%`);
        }
      );

      console.log('[Transfer] ZK proof generated');

      // ════════════════════════════════════════════════════════════════
      // STEP 5: Unshield to recipient
      // ════════════════════════════════════════════════════════════════
      progress('unshielding', 85, 'Unshielding to recipient...');

      const { transaction: unshieldTx } = await populateProvedUnshield(
        txidVersion,
        networkName,
        senderWalletID,
        unshieldRecipients,
        [], // NFTs
        undefined, // No broadcaster fee
        true, // sendWithPublicWallet
        overallBatchMinGasPrice,
        unshieldGasDetails
      );

      const unshieldTxResponse = await signerWallet.sendTransaction(unshieldTx);
      console.log('[Transfer] Unshield TX sent:', unshieldTxResponse.hash);

      progress('unshielding', 90, 'Waiting for unshield confirmation...', unshieldTxResponse.hash);
      await unshieldTxResponse.wait();
      console.log('[Transfer] Unshield confirmed');

      // ════════════════════════════════════════════════════════════════
      // COMPLETE
      // ════════════════════════════════════════════════════════════════
      progress('complete', 100, 'Transfer complete!', unshieldTxResponse.hash);

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
