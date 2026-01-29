import "dotenv/config";
import { ethers, Contract } from "ethers";
import {
  NETWORK_CONFIG as RAILGUN_NETWORK_CONFIG,
  NetworkName,
  TXIDVersion,
  type RailgunERC20AmountRecipient,
} from "@railgun-community/shared-models";
import {
  refreshBalances,
  balanceForERC20Token,
  walletForID,
  gasEstimateForShield,
  populateShield,
  getShieldPrivateKeySignatureMessage,
} from "@railgun-community/wallet";
import { engine } from "../core/engine";
import { walletService } from "../core/wallet";
import { NETWORK_CONFIG } from "../utils/config";
import { createLogger } from "../utils/logger";

const logger = createLogger("QuickShield");

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const RAILGUN_PROXY = "0x19b620929f97b7b990801496c3b361ca5def8c71"; // Sepolia

/**
 * 🚀 Quick Shield for Hackathon Demo
 * 
 * Shields USDC to your RAILGUN wallet so you can do private transfers.
 * Run this first, wait ~60 seconds, then run transfer:self
 */
export async function quickShield(): Promise<boolean> {
  const privateKey = process.env.PRIVATE_KEY;
  const shieldAmount = BigInt(process.env.SHIELD_AMOUNT || "5000000"); // 5 USDC default
  const testPassword = "orbit_hackathon_demo";

  if (!privateKey) {
    logger.error("❌ PRIVATE_KEY not found in .env file");
    return false;
  }

  try {
    logger.info("🛡️  Quick Shield for Hackathon");
    logger.info("═".repeat(50));
    logger.info(`Amount: ${ethers.formatUnits(shieldAmount, 6)} USDC`);
    logger.info("═".repeat(50));

    // Step 1: Initialize
    logger.info("\n[1/5] Initializing...");
    await engine.initialize();
    await engine.loadNetworkProvider();

    // Step 2: Setup wallets
    logger.info("\n[2/5] Setting up wallets...");
    const senderEntropy = ethers.keccak256(privateKey).slice(0, 34);
    const senderMnemonic = ethers.Mnemonic.fromEntropy(senderEntropy).phrase;
    
    const railgunWallet = await walletService.createWalletFromMnemonic(
      senderMnemonic,
      testPassword,
      "Demo"
    );

    const publicWallet = walletService.createPublicWallet(privateKey, NETWORK_CONFIG.RPC_URL);

    logger.info(`✅ Public: ${publicWallet.address}`);
    logger.info(`✅ 0zk: ${railgunWallet.railgunAddress.slice(0, 40)}...`);

    // Step 3: Check public USDC balance
    logger.info("\n[3/5] Checking balances...");
    const usdcContract = new Contract(NETWORK_CONFIG.TOKENS.USDC, USDC_ABI, publicWallet);
    const publicBalance = await usdcContract.balanceOf(publicWallet.address);
    const ethBalance = await publicWallet.provider!.getBalance(publicWallet.address);

    logger.info(`   Public USDC: ${ethers.formatUnits(publicBalance, 6)}`);
    logger.info(`   ETH for gas: ${ethers.formatEther(ethBalance)}`);

    if (publicBalance < shieldAmount) {
      logger.error(`\n❌ Insufficient USDC! Need ${ethers.formatUnits(shieldAmount, 6)}, have ${ethers.formatUnits(publicBalance, 6)}`);
      return false;
    }

    // Check current private balance
    const networkName = NetworkName.EthereumSepolia;
    const { chain } = RAILGUN_NETWORK_CONFIG[networkName];
    await refreshBalances(chain, [railgunWallet.walletID]);
    const abstractWallet = walletForID(railgunWallet.walletID);
    const privateTotal = await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle, abstractWallet, networkName, NETWORK_CONFIG.TOKENS.USDC, false
    );
    const privateSpendable = await balanceForERC20Token(
      TXIDVersion.V2_PoseidonMerkle, abstractWallet, networkName, NETWORK_CONFIG.TOKENS.USDC, true
    );
    logger.info(`   Private Total: ${ethers.formatUnits(privateTotal, 6)} USDC`);
    logger.info(`   Private Spendable: ${ethers.formatUnits(privateSpendable, 6)} USDC`);

    // Step 4: Approve USDC
    logger.info("\n[4/5] Approving USDC...");
    const currentAllowance = await usdcContract.allowance(publicWallet.address, RAILGUN_PROXY);
    
    if (currentAllowance < shieldAmount) {
      const approveTx = await usdcContract.approve(RAILGUN_PROXY, ethers.MaxUint256);
      logger.info(`   Approval TX: ${approveTx.hash}`);
      await approveTx.wait();
      logger.info("✅ Approved");
    } else {
      logger.info("✅ Already approved");
    }

    // Step 5: Shield
    logger.info("\n[5/5] Shielding...");

    // Generate shield signature
    const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
    const shieldPrivateKey = ethers.keccak256(
      ethers.toUtf8Bytes(await publicWallet.signMessage(shieldSignatureMessage))
    );

    const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
      {
        tokenAddress: NETWORK_CONFIG.TOKENS.USDC,
        amount: shieldAmount,
        recipientAddress: railgunWallet.railgunAddress,
      },
    ];

    // Gas estimate
    const { gasEstimate } = await gasEstimateForShield(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      shieldPrivateKey,
      erc20AmountRecipients,
      [],
      publicWallet.address
    );

    logger.info(`   Gas estimate: ${gasEstimate}`);

    // Populate and send
    const { transaction } = await populateShield(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      shieldPrivateKey,
      erc20AmountRecipients,
      [],
      {
        evmGasType: 2,
        gasEstimate,
        maxFeePerGas: BigInt(50 * 10 ** 9),
        maxPriorityFeePerGas: BigInt(2 * 10 ** 9),
      }
    );

    const txResponse = await publicWallet.sendTransaction(transaction);

    logger.info("\n" + "═".repeat(50));
    logger.info("🎉 SHIELD SUBMITTED!");
    logger.info("═".repeat(50));
    logger.info(`TX: ${txResponse.hash}`);
    logger.info(`Etherscan: https://sepolia.etherscan.io/tx/${txResponse.hash}`);
    logger.info("");
    logger.info("⏳ Waiting for confirmation...");

    await txResponse.wait();
    logger.info("✅ Confirmed!");
    logger.info("");
    logger.info("📝 NEXT STEPS:");
    logger.info("   1. Wait 60-90 seconds for POI verification");
    logger.info("   2. Run: npm run transfer:self");
    logger.info("");
    logger.info(`Shield target: ${railgunWallet.railgunAddress}`);
    logger.info("═".repeat(50));

    return true;
  } catch (error) {
    logger.error("\n❌ Shield failed:", error);
    return false;
  } finally {
    try { await engine.shutdown(); } catch {}
  }
}

// ESM compatible run check
const isRunDirectly = import.meta.url === `file://${process.argv[1]}` || 
                       process.argv[1]?.includes('quick-shield');

if (isRunDirectly) {
  console.log("\n🛡️  Quick Shield for Hackathon Demo\n");
  quickShield()
    .then((success) => {
      console.log(success ? "\n✅ Shield complete!" : "\n❌ Shield failed.");
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fatal:", error);
      process.exit(1);
    });
}
