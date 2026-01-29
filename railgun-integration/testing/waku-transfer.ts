/**
 * Run Private Transfer via Waku Broadcaster
 *
 * This script executes a fully private RAILGUN transfer using the Waku
 * Broadcaster network. This means:
 * - Your public wallet address is NEVER associated with the transaction
 * - The broadcaster pays gas on your behalf
 * - You pay a small fee from your private balance
 * - 100% transaction graph privacy is maintained
 *
 * USAGE:
 *   bun run src/testing/run-waku-transfer.ts [options]
 *
 * OPTIONS:
 *   --wait-poi, -w     Wait for POI (Proof of Innocence) verification
 *   --max-wait=N       Maximum minutes to wait for POI (default: 15)
 *   --force, -f        Force execution even with insufficient balance (testing)
 *
 * EXAMPLES:
 *   # Quick run (fails if funds not spendable)
 *   bun run src/testing/run-waku-transfer.ts
 *
 *   # Wait for POI verification
 *   bun run src/testing/run-waku-transfer.ts --wait-poi
 *
 *   # Wait up to 30 minutes for POI
 *   bun run src/testing/run-waku-transfer.ts --wait-poi --max-wait=30
 *
 * ENVIRONMENT (.env):
 *   PRIVATE_KEY      - Your wallet's private key (derives RAILGUN wallet)
 *   TRANSFER_AMOUNT  - Amount in smallest units (e.g., 1000000 = 1 USDC)
 *
 * ADDRESSES:
 *   Sender:   0x0ce3580766DcdDAf281DcCE968885A989E9B0e99
 *   Receiver: 0x28aDCf970A21F9FE1Da1F5770670A55F76c4E995
 */

import { runPrivateTransferWithWaku } from "./private-transfer-waku.test";

// Parse command line arguments
const args = process.argv.slice(2);
const waitForPOI = args.includes("--wait-poi") || args.includes("-w");
const forceRun = args.includes("--force") || args.includes("-f");

let maxWaitMinutes = 15;
const maxWaitArg = args.find((a) => a.startsWith("--max-wait="));
if (maxWaitArg) {
  maxWaitMinutes = parseInt(maxWaitArg.split("=")[1], 10);
}

console.log("\n🔒 RAILGUN Private Transfer via Waku Broadcaster");
console.log("═".repeat(50));
console.log("");
console.log("Configuration:");
console.log(`  • Wait for POI: ${waitForPOI ? "Yes" : "No"}`);
if (waitForPOI) {
  console.log(`  • Max wait time: ${maxWaitMinutes} minutes`);
}
console.log(`  • Force run: ${forceRun ? "Yes" : "No"}`);
console.log("");

runPrivateTransferWithWaku({ waitForPOI, maxWaitMinutes, forceRun })
  .then((success) => {
    console.log("");
    if (success) {
      console.log("✅ Private transfer completed successfully!");
      console.log("   Your public address was NOT linked to this transaction.");
    } else {
      console.log("❌ Private transfer failed. See logs above for details.");
      console.log("");
      console.log("Common issues:");
      console.log("  • No spendable balance: Wait for POI or shield funds first");
      console.log("  • No broadcaster: Testnets have fewer broadcasters");
    }
    console.log("");
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });
