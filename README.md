# OrbitUX

**Privacy-First Stablecoin Transfers**

## The Problem It Solves

When you send someone USDC, they can look up the transaction on Etherscan and **see your entire wallet balance** — every token, every transaction, your complete financial history exposed from a simple payment.

This creates real problems. Coworkers can **figure out your salary** by tracing payroll transactions. Freelance clients can **see all your other clients** and what they're paying you. Competitors can **analyze your business spending**. For anyone holding significant crypto, visible wealth creates security risks — scammers target rich wallets, and there's even a term for the worst case: the **"$5 wrench attack"** where someone threatens you physically because they know exactly how much you're worth.

Traditional finance solved this decades ago. Venmo doesn't show your bank balance. Credit cards don't expose your history. But in crypto, every transaction is a public declaration of your wealth.

**OrbitUX fixes this using zero-knowledge proofs.** When you send USDC through OrbitUX, the recipient gets their money but **can't see where it came from**, can't look up your balance, can't trace your history. The payment appears from an **unlinkable address** — exactly how payments should work.

Here's how it works: your tokens get **"shielded"** into RAILGUN's private pool. We generate a **ZK proof** that mathematically proves you can spend those tokens *without revealing which ones or who you are*. Then the recipient gets paid through an **"unshield"** transaction with **zero on-chain connection** to the original. The cryptography makes linking them impossible, not just difficult.

We also solved the gas problem — **users never pay gas**, just sign a message. Our relayer handles all on-chain transactions. Click send, sign once, done.

Plus **batch payments**: pay multiple recipients in different stablecoins with one signature. Each person receives from an unlinkable source. Perfect for payroll where employees shouldn't see each other's salaries.

## Challenges We Ran Into

**Bun worker crashes** — ZK proof generation uses worker threads, and Bun's implementation has bugs causing ~30% of proofs to fail silently. We use Node.js (`npx tsx`) for proof-heavy operations while keeping Bun for the frontend.

**POI timing confusion** — After shielding, there's a 60-90 second "Proof of Innocence" verification before funds become spendable. Users saw tokens but couldn't spend them. We split balance into **"spendable" vs "pending POI"** with a countdown timer.

**Encryption key mismatches** — Client-side and server-side key derivation produced different results due to encoding differences, causing "wallet not found" errors. We **cache the canonical key server-side** on wallet creation.

**Gas abstraction** — We wanted zero-gas UX but Ethereum needs ETH for every transaction. We use **EIP-2612 permits** (gasless signatures) plus a relayer that executes and pays for all on-chain operations.

**Multi-token batches** — RAILGUN only supports one token per ZK proof, but users want to pay Alice in USDC and Bob in DAI together. We **group by token**, shield each separately, wait for POI in parallel, then generate proofs sequentially with balance sync waits between each.

**Real-time updates** — Transfers take 2-3 minutes and Next.js doesn't support SSE natively. We built a custom **ReadableStream implementation** that pushes progress events to the client.

## Tracks Applied

Privacy & Security, DeFi/Payments, User Experience, Account Abstraction

## Technologies Used

Next.js 16, React 19, TailwindCSS, Framer Motion, Three.js, wagmi, viem, RainbowKit, RAILGUN Protocol, snarkjs (Groth16), EIP-2612, EIP-7702, Chrome Extension Manifest V3, LevelDB

## Quick Start

```bash
git clone https://github.com/anomalyco/orbitux.git && cd orbitux
bun install
cp .env.example .env.local  # Add RELAYER_PRIVATE_KEY and RPC URL
bun dev
```

---

*Because your crypto balance is nobody's business but yours.*
