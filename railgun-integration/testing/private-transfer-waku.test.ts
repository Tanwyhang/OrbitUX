import "dotenv/config";
import { ethers } from "ethers";
import {
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG,
  NetworkName,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
  type TransactionGasDetails,
  type RailgunERC20AmountRecipient,
} from "@railgun-community/shared-models";
import {
  refreshBalances,
  balanceForERC20Token,
  walletForID,
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
} from "@railgun-community/wallet";
import { engine } from "../core/engine";
import { walletService } from "../core/wallet";
import { wakuService } from "../services/waku.service";
import { NETWORK_CONFIG } from "../utils/config";
import { createLogger } from "../utils/logger";

const logger = createLogger("PrivateTransferWaku");

/**
 * Private Transfer via Waku Broadcaster
 *
 * This test executes a fully private ERC-20 transfer from one RAILGUN address
 * to another, using the Waku Broadcaster network to relay the transaction.
 *
 * Why Waku Broadcaster?
 * - Your public wallet address is NEVER associated with the transaction
 * - The broadcaster pays gas on your behalf
 * - You pay a small fee from your private balance to the broadcaster's private balance
 * - Maintains 100% transaction graph privacy
 *
 * Sender Public: 0x0ce3580766DcdDAf281DcCE968885A989E9B0e99
 * Receiver Public: 0x28aDCf970A21F9FE1Da1F5770670A55F76c4E995
 */

const SENDER_PUBLIC = "0x0ce3580766DcdDAf281DcCE968885A989E9B0e99";
const RECEIVER_PUBLIC = "0x28aDCf970A21F9FE1Da1F5770670A55F76c4E995";

interface TransferOptions {
  waitForPOI?: boolean;
  maxWaitMinutes?: number;
  forceRun?: boolean; // Skip balance check for testing
}

async function waitForSpendableBalance(
  walletID: string,
  requiredAmount: bigint,
  maxMinutes: number
): Promise<{ spendable: bigint; total: bigint; ready: boolean }> {
  const networkName = NetworkName.EthereumSepolia;
  const { chain } = RAILGUN_NETWORK_CONFIG[networkName];
  const intervalMs = 30000; // Check every 30 seconds
  const maxAttempts = Math.ceil((maxMinutes * 60 * 1000) / intervalMs);

  logger.info(`Waiting up to ${maxMinutes} minutes for POI verification...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await refreshBalances(chain, [walletID]);
    const abstractWallet = walletForID(walletID);

    const spendable = await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle,
      abstractWallet,
      networkName,
      NETWORK_CONFIG.TOKENS.USDC,
      true
    );

    const total = await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle,
      abstractWallet,
      networkName,
      NETWORK_CONFIG.TOKENS.USDC,
      false
    );

    logger.info(
      `[POI Check ${attempt + 1}/${maxAttempts}] Spendable: ${ethers.formatUnits(
        spendable,
        6
      )} / Total: ${ethers.formatUnits(total, 6)} USDC`
    );

    if (spendable >= requiredAmount) {
      return { spendable, total, ready: true };
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const abstractWallet = walletForID(walletID);
  const finalSpendable = await balanceForERC20Token(
    TXIDVersion.V2_PoseidonMerkle,
    abstractWallet,
    networkName,
    NETWORK_CONFIG.TOKENS.USDC,
    true
  );
  const finalTotal = await balanceForERC20Token(
    TXIDVersion.V2_PoseidonMerkle,
    abstractWallet,
    networkName,
    NETWORK_CONFIG.TOKENS.USDC,
    false
  );

  return { spendable: finalSpendable, total: finalTotal, ready: finalSpendable >= requiredAmount };
}

export async function runPrivateTransferWithWaku(
  options: TransferOptions = {}
): Promise<boolean> {
  const { waitForPOI = false, maxWaitMinutes = 15, forceRun = false } = options;
  const privateKey = process.env.PRIVATE_KEY;
  const transferAmount = BigInt(process.env.TRANSFER_AMOUNT || "1000000"); // 1 USDC default
  const testPassword = "orbit_private_transfer_test";

  if (!privateKey) {
    logger.error("PRIVATE_KEY not found in .env file");
    return false;
  }

  try {
    logger.info("=".repeat(60));
    logger.info("RAILGUN Private Transfer via Waku Broadcaster");
    logger.info("=".repeat(60));
    logger.info(`Sender (Public): ${SENDER_PUBLIC}`);
    logger.info(`Receiver (Public): ${RECEIVER_PUBLIC}`);
    logger.info(`Transfer Amount: ${ethers.formatUnits(transferAmount, 6)} USDC`);
    logger.info(`Wait for POI: ${waitForPOI} (max ${maxWaitMinutes} min)`);
    logger.info("=".repeat(60));

    // ===============================================
    // Step 1: Initialize RAILGUN Engine
    // ===============================================
    logger.info("\n[Step 1] Initializing RAILGUN Engine...");
    await engine.initialize();
    await engine.loadNetworkProvider();
    logger.info("[SDK] Engine ready:", engine.isReady());

    // ===============================================
    // Step 2: Create/Load RAILGUN Wallets
    // ===============================================
    logger.info("\n[Step 2] Setting up RAILGUN wallets...");

    // Derive deterministic mnemonic from sender's private key for persistence
    const senderEntropy = ethers.keccak256(privateKey).slice(0, 34);
    const senderMnemonic = ethers.Mnemonic.fromEntropy(senderEntropy).phrase;

    // Create a separate mnemonic for receiver (derived from receiver address for demo)
    const receiverEntropy = ethers
      .keccak256(ethers.toUtf8Bytes(RECEIVER_PUBLIC))
      .slice(0, 34);
    const receiverMnemonic = ethers.Mnemonic.fromEntropy(receiverEntropy).phrase;

    const senderWallet = await walletService.createWalletFromMnemonic(
      senderMnemonic,
      testPassword,
      "SenderWallet"
    );

    const receiverWallet = await walletService.createWalletFromMnemonic(
      receiverMnemonic,
      testPassword,
      "ReceiverWallet"
    );

    logger.info("[SDK] Sender RAILGUN Wallet:");
    logger.info(
      JSON.stringify(
        {
          walletID: senderWallet.walletID,
          railgunAddress: senderWallet.railgunAddress.slice(0, 40) + "...",
        },
        null,
        2
      )
    );

    logger.info("[SDK] Receiver RAILGUN Address:");
    logger.info(
      JSON.stringify(
        {
          walletID: receiverWallet.walletID,
          railgunAddress: receiverWallet.railgunAddress.slice(0, 40) + "...",
        },
        null,
        2
      )
    );

    // ===============================================
    // Step 3: Check Private Balance
    // ===============================================
    logger.info("\n[Step 3] Checking private balances...");

    const networkName = NetworkName.EthereumSepolia;
    const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

    await refreshBalances(chain, [senderWallet.walletID]);

    const abstractWallet = walletForID(senderWallet.walletID);

    let spendableBalance = await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle,
      abstractWallet,
      networkName,
      NETWORK_CONFIG.TOKENS.USDC,
      true // onlySpendable
    );

    let totalBalance = await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle,
      abstractWallet,
      networkName,
      NETWORK_CONFIG.TOKENS.USDC,
      false // onlySpendable
    );

    logger.info(`[SDK] Total Private USDC: ${ethers.formatUnits(totalBalance, 6)}`);
    logger.info(
      `[SDK] Spendable Private USDC: ${ethers.formatUnits(spendableBalance, 6)}`
    );

    // Wait for POI if enabled and funds are pending
    if (waitForPOI && totalBalance > 0n && spendableBalance < transferAmount) {
      logger.info("\n[POI] Funds detected but not yet spendable. Waiting for POI...");
      const result = await waitForSpendableBalance(
        senderWallet.walletID,
        transferAmount,
        maxWaitMinutes
      );
      spendableBalance = result.spendable;
      totalBalance = result.total;

      if (!result.ready) {
        logger.error("POI verification timed out. Funds still not spendable.");
        logger.info("Try again later or run with --wait-poi=true --max-wait=30");
        return false;
      }
    }

    // Balance check
    if (!forceRun && spendableBalance < transferAmount) {
      logger.error(`Insufficient spendable balance!`);
      logger.error(`Required: ${ethers.formatUnits(transferAmount, 6)} USDC`);
      logger.error(`Available: ${ethers.formatUnits(spendableBalance, 6)} USDC`);
      logger.info("\n---- OPTIONS ----");
      logger.info("1. Wait for POI: Run again with --wait-poi flag");
      logger.info("2. Shield funds: Send USDC to your RAILGUN address first");
      logger.info(`   Shield target: ${senderWallet.railgunAddress}`);
      return false;
    }

    // ===============================================
    // Step 4: Initialize Waku Broadcaster Client
    // ===============================================
    logger.info("\n[Step 4] Connecting to Waku Broadcaster Network...");
    await wakuService.initialize(networkName);
    logger.info("[SDK] Waku connected:", wakuService.isConnected());

    // ===============================================
    // Step 5: Find Best Broadcaster
    // ===============================================
    logger.info("\n[Step 5] Finding best broadcaster for USDC...");

    const useRelayAdapt = false;
    const broadcaster = await wakuService.findBestBroadcaster(
      NETWORK_CONFIG.TOKENS.USDC,
      useRelayAdapt,
      networkName
    );

    if (!broadcaster) {
      logger.error("No broadcaster available for USDC on Sepolia.");
      logger.info("Broadcasters are less common on testnets.");
      logger.info("Consider using self-signing mode for testing.");
      return false;
    }

    logger.info("[SDK] Selected Broadcaster:");
    logger.info(
      JSON.stringify(
        {
          railgunAddress: broadcaster.railgunAddress.slice(0, 40) + "...",
          tokenAddress: broadcaster.tokenAddress,
          feePerUnitGas: broadcaster.tokenFee.feePerUnitGas,
          feesID: broadcaster.tokenFee.feesID,
        },
        null,
        2
      )
    );

    // ===============================================
    // Step 6: Prepare Transfer Recipients
    // ===============================================
    logger.info("\n[Step 6] Preparing transfer...");

    const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
      {
        tokenAddress: NETWORK_CONFIG.TOKENS.USDC,
        amount: transferAmount,
        recipientAddress: receiverWallet.railgunAddress,
      },
    ];

    // ===============================================
    // Step 7: Estimate Gas
    // ===============================================
    logger.info("\n[Step 7] Estimating gas...");

    const originalGasDetails: TransactionGasDetails = {
      evmGasType: EVMGasType.Type2,
      gasEstimate: BigInt(0),
      maxFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxFeePerGas,
      maxPriorityFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxPriorityFeePerGas,
    };

    const sendWithPublicWallet = false;
    const memo = "Private transfer via Waku";

    const initialGasEstimate = await gasEstimateForUnprovenTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      senderWallet.walletID,
      senderWallet.encryptionKey,
      memo,
      erc20AmountRecipients,
      [],
      originalGasDetails,
      undefined,
      sendWithPublicWallet
    );

    const gasEstimate = initialGasEstimate.gasEstimate;
    logger.info(`[SDK] Gas Estimate: ${gasEstimate}`);

    // ===============================================
    // Step 8: Calculate Broadcaster Fee
    // ===============================================
    logger.info("\n[Step 8] Calculating broadcaster fee...");

    const estimatedGasDetails: TransactionGasDetails = {
      evmGasType: EVMGasType.Type2,
      gasEstimate,
      maxFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxFeePerGas,
      maxPriorityFeePerGas: NETWORK_CONFIG.GAS_PRICE_FALLBACK.maxPriorityFeePerGas,
    };

    const broadcasterFee = wakuService.calculateBroadcasterFee(
      broadcaster,
      estimatedGasDetails
    );

    logger.info(
      `[SDK] Broadcaster Fee: ${ethers.formatUnits(broadcasterFee.amount, 6)} USDC`
    );

    const totalRequired = transferAmount + broadcasterFee.amount;
    if (!forceRun && spendableBalance < totalRequired) {
      logger.error(`Insufficient balance for transfer + broadcaster fee`);
      logger.error(`Required: ${ethers.formatUnits(totalRequired, 6)} USDC`);
      logger.error(`Available: ${ethers.formatUnits(spendableBalance, 6)} USDC`);
      return false;
    }

    // ===============================================
    // Step 9: Generate ZK Proof
    // ===============================================
    logger.info("\n[Step 9] Generating ZK Proof (this may take 20-60 seconds)...");

    const overallBatchMinGasPrice = calculateGasPrice(estimatedGasDetails);

    await generateTransferProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      senderWallet.walletID,
      senderWallet.encryptionKey,
      true,
      memo,
      erc20AmountRecipients,
      [],
      broadcasterFee,
      sendWithPublicWallet,
      overallBatchMinGasPrice,
      (progress) => {
        if (progress % 10 === 0 || progress >= 99) {
          logger.info(`[SDK] Proof generation progress: ${progress}%`);
        }
      }
    );

    logger.info("[SDK] ZK Proof generated successfully!");

    // ===============================================
    // Step 10: Populate Transaction
    // ===============================================
    logger.info("\n[Step 10] Populating proved transaction...");

    const populateResponse = await populateProvedTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      senderWallet.walletID,
      true,
      memo,
      erc20AmountRecipients,
      [],
      broadcasterFee,
      sendWithPublicWallet,
      overallBatchMinGasPrice,
      estimatedGasDetails
    );

    logger.info("[SDK] Transaction populated:");
    logger.info(
      JSON.stringify(
        {
          to: populateResponse.transaction.to,
          dataLength: populateResponse.transaction.data?.length || 0,
          nullifiersCount: populateResponse.nullifiers?.length || 0,
        },
        null,
        2
      )
    );

    // ===============================================
    // Step 11: Submit via Waku Broadcaster
    // ===============================================
    logger.info("\n[Step 11] Submitting transaction via Waku Broadcaster...");
    logger.info("This maintains complete privacy - no public wallet association!");

    const nullifiers = populateResponse.nullifiers ?? [];

    const txHash = await wakuService.submitTransaction(
      {
        to: populateResponse.transaction.to || "",
        data: populateResponse.transaction.data?.toString() || "",
      },
      nullifiers,
      broadcaster,
      overallBatchMinGasPrice,
      useRelayAdapt,
      networkName
    );

    // ===============================================
    // Success!
    // ===============================================
    logger.info("\n" + "=".repeat(60));
    logger.info("PRIVATE TRANSFER SUCCESSFUL!");
    logger.info("=".repeat(60));
    logger.info(`Transaction Hash: ${txHash}`);
    logger.info(`View on Etherscan: https://sepolia.etherscan.io/tx/${txHash}`);
    logger.info("");
    logger.info("Summary:");
    logger.info(`  - Amount: ${ethers.formatUnits(transferAmount, 6)} USDC`);
    logger.info(
      `  - Broadcaster Fee: ${ethers.formatUnits(broadcasterFee.amount, 6)} USDC`
    );
    logger.info(`  - From: ${senderWallet.railgunAddress.slice(0, 40)}...`);
    logger.info(`  - To: ${receiverWallet.railgunAddress.slice(0, 40)}...`);
    logger.info("");
    logger.info("Privacy preserved - your public address was NOT used!");
    logger.info("=".repeat(60));

    return true;
  } catch (error) {
    logger.error("Private transfer failed:", error);
    return false;
  } finally {
    try {
      await wakuService.disconnect();
      await engine.shutdown();
      logger.info("[SDK] Cleanup complete");
    } catch (shutdownError) {
      logger.error("Cleanup error:", shutdownError);
    }
  }
}

// Parse CLI arguments
function parseArgs(): TransferOptions {
  const args = process.argv.slice(2);
  const options: TransferOptions = {};

  for (const arg of args) {
    if (arg === "--wait-poi" || arg === "-w") {
      options.waitForPOI = true;
    } else if (arg.startsWith("--max-wait=")) {
      options.maxWaitMinutes = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--force" || arg === "-f") {
      options.forceRun = true;
    }
  }

  return options;
}

// ESM compatible run check
const isRunDirectly = import.meta.url === `file://${process.argv[1]}` || 
                       process.argv[1]?.includes('private-transfer-waku');

if (isRunDirectly) {
  const options = parseArgs();

  console.log("\n🔒 Starting Private Transfer via Waku Broadcaster...\n");
  if (options.waitForPOI) {
    console.log(`📌 Will wait up to ${options.maxWaitMinutes || 15} minutes for POI\n`);
  }

  runPrivateTransferWithWaku(options)
    .then((success) => {
      if (success) {
        console.log("\n✅ Private transfer completed successfully!\n");
      } else {
        console.log("\n❌ Private transfer failed. Check logs above.\n");
      }
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}
