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
import { NETWORK_CONFIG } from "../utils/config";
import { createLogger } from "../utils/logger";

const logger = createLogger("PrivateTransferSelfSign");

/**
 * 🚀 HACKATHON-GRADE Private Transfer with Self-Signing
 *
 * This is the FASTEST path to a working demo:
 * - Uses your own wallet to sign & pay gas (self-relaying)
 * - Transaction contents are FULLY ENCRYPTED (private UTXO)
 * - No external broadcaster dependency
 * - Works immediately when you have spendable balance
 *
 * Sender Public: 0x0ce3580766DcdDAf281DcCE968885A989E9B0e99
 * Receiver Public: 0x28aDCf970A21F9FE1Da1F5770670A55F76c4E995
 */

const SENDER_PUBLIC = "0x0ce3580766DcdDAf281DcCE968885A989E9B0e99";
const RECEIVER_PUBLIC = "0x28aDCf970A21F9FE1Da1F5770670A55F76c4E995";

export async function runPrivateTransferSelfSign(): Promise<boolean> {
  const privateKey = process.env.PRIVATE_KEY;
  const transferAmount = BigInt(process.env.TRANSFER_AMOUNT || "1000000"); // 1 USDC default
  const testPassword = "orbit_hackathon_demo";

  if (!privateKey) {
    logger.error("❌ PRIVATE_KEY not found in .env file");
    return false;
  }

  try {
    logger.info("🚀 RAILGUN Private Transfer (Self-Signed)");
    logger.info("═".repeat(50));
    logger.info(`Sender: ${SENDER_PUBLIC}`);
    logger.info(`Receiver: ${RECEIVER_PUBLIC}`);
    logger.info(`Amount: ${ethers.formatUnits(transferAmount, 6)} USDC`);
    logger.info("═".repeat(50));

    // ═══════════════════════════════════════════════════
    // Step 1: Initialize Engine
    // ═══════════════════════════════════════════════════
    logger.info("\n[1/7] Initializing RAILGUN Engine...");
    await engine.initialize();
    await engine.loadNetworkProvider();
    logger.info("✅ Engine ready");

    // ═══════════════════════════════════════════════════
    // Step 2: Create Wallets
    // ═══════════════════════════════════════════════════
    logger.info("\n[2/7] Setting up wallets...");

    // Deterministic mnemonic from private key (same wallet every time)
    const senderEntropy = ethers.keccak256(privateKey).slice(0, 34);
    const senderMnemonic = ethers.Mnemonic.fromEntropy(senderEntropy).phrase;

    const receiverEntropy = ethers.keccak256(ethers.toUtf8Bytes(RECEIVER_PUBLIC)).slice(0, 34);
    const receiverMnemonic = ethers.Mnemonic.fromEntropy(receiverEntropy).phrase;

    const senderRailgun = await walletService.createWalletFromMnemonic(
      senderMnemonic,
      testPassword,
      "Sender"
    );

    const receiverRailgun = await walletService.createWalletFromMnemonic(
      receiverMnemonic,
      testPassword,
      "Receiver"
    );

    // Public wallet for signing
    const signerWallet = walletService.createPublicWallet(privateKey, NETWORK_CONFIG.RPC_URL);

    logger.info(`✅ Sender 0zk: ${senderRailgun.railgunAddress.slice(0, 30)}...`);
    logger.info(`✅ Receiver 0zk: ${receiverRailgun.railgunAddress.slice(0, 30)}...`);
    logger.info(`✅ Signer: ${signerWallet.address}`);

    // ═══════════════════════════════════════════════════
    // Step 3: Check Balance (with refresh loop for hackathon)
    // ═══════════════════════════════════════════════════
    logger.info("\n[3/7] Checking private balance...");

    const networkName = NetworkName.EthereumSepolia;
    const { chain } = RAILGUN_NETWORK_CONFIG[networkName];

    // Refresh loop - helps unlock notes faster
    let spendableBalance = BigInt(0);
    let totalBalance = BigInt(0);

    for (let i = 0; i < 3; i++) {
      await refreshBalances(chain, [senderRailgun.walletID]);
      const abstractWallet = walletForID(senderRailgun.walletID);

      spendableBalance = await balanceForERC20Token(
        TXIDVersion.V2_PoseidonMerkle,
        abstractWallet,
        networkName,
        NETWORK_CONFIG.TOKENS.USDC,
        true
      );

      totalBalance = await balanceForERC20Token(
        TXIDVersion.V2_PoseidonMerkle,
        abstractWallet,
        networkName,
        NETWORK_CONFIG.TOKENS.USDC,
        false
      );

      logger.info(`   Attempt ${i + 1}: Spendable ${ethers.formatUnits(spendableBalance, 6)} / Total ${ethers.formatUnits(totalBalance, 6)} USDC`);

      if (spendableBalance >= transferAmount) break;
      if (i < 2) await new Promise(r => setTimeout(r, 5000));
    }

    if (spendableBalance < transferAmount) {
      logger.error("\n⚠️  Insufficient spendable balance!");
      logger.error(`   Need: ${ethers.formatUnits(transferAmount, 6)} USDC`);
      logger.error(`   Have: ${ethers.formatUnits(spendableBalance, 6)} USDC`);
      logger.info("\n💡 For demo: Shield funds, wait 30-60 seconds, then try again.");
      logger.info(`   Shield to: ${senderRailgun.railgunAddress}`);
      return false;
    }

    logger.info(`✅ Spendable: ${ethers.formatUnits(spendableBalance, 6)} USDC`);

    // ═══════════════════════════════════════════════════
    // Step 4: Prepare Transfer
    // ═══════════════════════════════════════════════════
    logger.info("\n[4/7] Preparing transfer...");

    const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
      {
        tokenAddress: NETWORK_CONFIG.TOKENS.USDC,
        amount: transferAmount,
        recipientAddress: receiverRailgun.railgunAddress,
      },
    ];

    const memo = "🚀 Private hackathon transfer";
    const sendWithPublicWallet = true; // SELF-SIGNING MODE

    // ═══════════════════════════════════════════════════
    // Step 5: Estimate Gas
    // ═══════════════════════════════════════════════════
    logger.info("\n[5/7] Estimating gas...");

    const feeData = await signerWallet.provider!.getFeeData();

    const originalGasDetails: TransactionGasDetails = {
      evmGasType: EVMGasType.Type2,
      gasEstimate: BigInt(0),
      maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
    };

    const { gasEstimate } = await gasEstimateForUnprovenTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      senderRailgun.walletID,
      senderRailgun.encryptionKey,
      memo,
      erc20AmountRecipients,
      [],
      originalGasDetails,
      undefined, // No broadcaster fee for self-signing
      sendWithPublicWallet
    );

    logger.info(`✅ Gas estimate: ${gasEstimate}`);

    // ═══════════════════════════════════════════════════
    // Step 6: Generate ZK Proof
    // ═══════════════════════════════════════════════════
    logger.info("\n[6/7] Generating ZK Proof (20-40 seconds)...");

    const gasDetails: TransactionGasDetails = {
      evmGasType: EVMGasType.Type2,
      gasEstimate,
      maxFeePerGas: feeData.maxFeePerGas ?? BigInt(50 * 10 ** 9),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? BigInt(2 * 10 ** 9),
    };

    const overallBatchMinGasPrice = calculateGasPrice(gasDetails);

    await generateTransferProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      senderRailgun.walletID,
      senderRailgun.encryptionKey,
      true, // showSenderAddressToRecipient
      memo,
      erc20AmountRecipients,
      [],
      undefined, // No broadcaster fee
      sendWithPublicWallet,
      overallBatchMinGasPrice,
      (progress) => {
        if (progress % 25 === 0) logger.info(`   Proof: ${progress}%`);
      }
    );

    logger.info("✅ ZK Proof generated!");

    // ═══════════════════════════════════════════════════
    // Step 7: Sign & Submit Transaction
    // ═══════════════════════════════════════════════════
    logger.info("\n[7/7] Signing & submitting transaction...");

    const { transaction } = await populateProvedTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      senderRailgun.walletID,
      true,
      memo,
      erc20AmountRecipients,
      [],
      undefined, // No broadcaster fee
      sendWithPublicWallet,
      overallBatchMinGasPrice,
      gasDetails
    );

    logger.info("   Sending to network...");
    const txResponse = await signerWallet.sendTransaction(transaction);

    logger.info("\n" + "═".repeat(50));
    logger.info("🎉 PRIVATE TRANSFER SUCCESSFUL!");
    logger.info("═".repeat(50));
    logger.info(`TX Hash: ${txResponse.hash}`);
    logger.info(`Etherscan: https://sepolia.etherscan.io/tx/${txResponse.hash}`);
    logger.info("");
    logger.info("📝 Summary:");
    logger.info(`   Amount: ${ethers.formatUnits(transferAmount, 6)} USDC`);
    logger.info(`   From: ${senderRailgun.railgunAddress.slice(0, 30)}...`);
    logger.info(`   To: ${receiverRailgun.railgunAddress.slice(0, 30)}...`);
    logger.info("");
    logger.info("🔐 Transaction contents are ENCRYPTED on-chain!");
    logger.info("═".repeat(50));

    // Wait for confirmation
    logger.info("\n⏳ Waiting for confirmation...");
    const receipt = await txResponse.wait();
    logger.info(`✅ Confirmed in block ${receipt?.blockNumber}`);

    return true;
  } catch (error) {
    logger.error("\n❌ Transfer failed:", error);
    return false;
  } finally {
    try {
      await engine.shutdown();
    } catch {}
  }
}

// Run directly - ESM compatible
const isRunDirectly = import.meta.url === `file://${process.argv[1]}` || 
                       process.argv[1]?.includes('private-transfer-self-sign');

if (isRunDirectly) {
  console.log("\n🔒 Starting Private Transfer (Self-Signed)...\n");

  runPrivateTransferSelfSign()
    .then((success) => {
      console.log(success ? "\n✅ Demo complete!" : "\n❌ Demo failed.");
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fatal:", error);
      process.exit(1);
    });
}
