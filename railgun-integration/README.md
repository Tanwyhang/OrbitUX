# RAILGUN Integration Package

> 🔐 **Complete private transaction system for Web3 applications**
> 
> This is a self-contained package for integrating RAILGUN's zero-knowledge privacy layer into any frontend application.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Core Concepts](#core-concepts)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)
8. [Transaction Flows](#transaction-flows)
9. [Frontend Integration](#frontend-integration)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What is RAILGUN?

RAILGUN is a privacy protocol that enables:
- **Private balances**: Hold tokens invisibly on-chain
- **Private transfers**: Send tokens without revealing sender/receiver
- **Zero-knowledge proofs**: Cryptographic verification without data exposure

### Key Addresses

| Address Type | Format | Example |
|--------------|--------|---------|
| Public (Ethereum) | `0x...` | `0x0ce3580766DcdDAf281DcCE968885A989E9B0e99` |
| Private (RAILGUN) | `0zk1q...` | `0zk1qynu8nyfmkqm3hyrase0c7...` |

### Transaction Types

| Type | Description | Gas Payer |
|------|-------------|-----------|
| **Shield** | Public → Private | You (public wallet) |
| **Transfer** | Private → Private | Broadcaster OR You |
| **Unshield** | Private → Public | Broadcaster OR You |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Frontend                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Shield    │  │  Transfer   │  │      Unshield       │  │
│  │   Button    │  │   Button    │  │       Button        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │            │
└─────────┼────────────────┼─────────────────────┼────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 RAILGUN Integration Layer                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    RailgunEngine                     │   │
│  │  • Initialize ZK circuits                           │   │
│  │  • Manage network providers                         │   │
│  │  • Configure artifact storage                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────┼───────────────────────────┐   │
│  │                    WalletService                     │   │
│  │  • Create RAILGUN wallets (0zk addresses)           │   │
│  │  • Check private balances                           │   │
│  │  • Derive from mnemonic/private key                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────┼───────────────────────────┐   │
│  │                TransactionService                    │   │
│  │  • Shield (public → private)                        │   │
│  │  • Transfer (private → private)                     │   │
│  │  • Unshield (private → public)                      │   │
│  │  • Generate ZK proofs                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Blockchain Layer                        │
│  • RAILGUN Smart Contracts (Sepolia: 0x19b620929...)       │
│  • ERC-20 Token Contracts                                  │
│  • POI (Proof of Innocence) Aggregators                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install @railgun-community/wallet @railgun-community/shared-models @railgun-community/waku-broadcaster-client-node ethers leveldown snarkjs dotenv
```

### 2. Initialize Engine (once at app start)

```typescript
import { engine } from './core/engine';

// Initialize RAILGUN on app mount
await engine.initialize();
await engine.loadNetworkProvider();
```

### 3. Create/Load Wallet

```typescript
import { walletService } from './core/wallet';

// Create RAILGUN wallet from mnemonic
const wallet = await walletService.createWalletFromMnemonic(
  mnemonic,
  "user_password",
  "MyWallet"
);

console.log(wallet.railgunAddress); // 0zk1q...
```

### 4. Shield Funds (Public → Private)

```typescript
import { shieldTokens } from './services/shield';

const txHash = await shieldTokens({
  tokenAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC
  amount: BigInt("1000000"), // 1 USDC (6 decimals)
  railgunAddress: wallet.railgunAddress,
  signer: ethersWallet,
});
```

### 5. Private Transfer

```typescript
import { privateTransfer } from './services/transfer';

const txHash = await privateTransfer({
  tokenAddress: USDC_ADDRESS,
  amount: BigInt("500000"), // 0.5 USDC
  fromWalletID: senderWallet.walletID,
  toRailgunAddress: receiverWallet.railgunAddress,
  signer: ethersWallet,
});
```

---

## Core Concepts

### RAILGUN Wallet vs Ethereum Wallet

| Aspect | Ethereum Wallet | RAILGUN Wallet |
|--------|-----------------|----------------|
| Address format | `0x...` (42 chars) | `0zk1q...` (128+ chars) |
| Balance visibility | Public on Etherscan | Hidden, only owner knows |
| Created from | Private key | Mnemonic + encryption password |
| Used for | Gas payments, public tokens | Private balances, private transfers |

### Proof of Innocence (POI)

After shielding, funds go through **POI verification** (~60-90 seconds):

```
Shield TX confirmed → POI Verification → Funds SPENDABLE
```

- **Total Balance**: All funds (including unverified)
- **Spendable Balance**: Only POI-verified funds that can be transferred

### Self-Signing vs Broadcaster

| Mode | Privacy Level | Gas Payer | Speed |
|------|--------------|-----------|-------|
| **Self-Sign** | Medium (gas payer visible) | You | Instant |
| **Broadcaster** | Maximum (anonymous) | Broadcaster | Depends on availability |

For hackathons/testnets, use **Self-Sign** mode.

---

## Installation

### Required Dependencies

```json
{
  "dependencies": {
    "@railgun-community/wallet": "^10.8.1",
    "@railgun-community/shared-models": "^8.0.0",
    "@railgun-community/waku-broadcaster-client-node": "^9.0.3",
    "ethers": "^6.16.0",
    "leveldown": "^6.1.1",
    "snarkjs": "^0.7.6",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/leveldown": "^4.0.6",
    "@types/snarkjs": "^0.7.9"
  }
}
```

### Project Type

```json
{
  "type": "module"
}
```

> ⚠️ **Important**: Use Node.js (via `npx tsx`) instead of Bun for ZK proof generation. Bun has worker thread bugs.

---

## Configuration

### Environment Variables (`.env`)

```env
# Required
PRIVATE_KEY=your_ethereum_private_key_here

# Optional
RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
TRANSFER_AMOUNT=1000000
SHIELD_AMOUNT=5000000
```

### Network Configuration

```typescript
// config.ts
import { NetworkName } from "@railgun-community/shared-models";

export const NETWORK_CONFIG = {
  NETWORK: NetworkName.EthereumSepolia,
  CHAIN_ID: 11155111,
  RPC_URL: "https://sepolia.infura.io/v3/YOUR_KEY",
  
  TOKENS: {
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },
  
  // POI aggregator for testnet
  POI_NODES: ["https://ppoi-agg.horsewithsixlegs.xyz"],
  
  // RAILGUN proxy contract (for approvals)
  PROXY_CONTRACT: "0x19b620929f97b7b990801496c3b361ca5def8c71",
};
```

---

## API Reference

### Engine

```typescript
// Initialize (call once at app startup)
await engine.initialize();
await engine.loadNetworkProvider();

// Check status
engine.isReady();        // Engine initialized
engine.isNetworkReady(); // Provider loaded

// Cleanup (call on app unmount)
await engine.shutdown();
```

### WalletService

```typescript
// Create wallet from mnemonic
const wallet = await walletService.createWalletFromMnemonic(
  mnemonic: string,
  password: string,
  walletName: string
);
// Returns: { walletID, railgunAddress, encryptionKey }

// Create public wallet (for signing)
const signer = walletService.createPublicWallet(privateKey, rpcUrl);

// Generate new mnemonic
const mnemonic = walletService.generateMnemonic();
```

### Balance Functions

```typescript
import { 
  refreshBalances, 
  balanceForERC20Token, 
  walletForID 
} from "@railgun-community/wallet";

// Refresh balances
const { chain } = RAILGUN_NETWORK_CONFIG[networkName];
await refreshBalances(chain, [walletID]);

// Get balance
const abstractWallet = walletForID(walletID);
const spendableBalance = await balanceForERC20Token(
  TXIDVersion.V2_PoseidonMerkle,
  abstractWallet,
  networkName,
  tokenAddress,
  true // onlySpendable
);
```

### Shield Functions

```typescript
import { 
  gasEstimateForShield, 
  populateShield,
  getShieldPrivateKeySignatureMessage 
} from "@railgun-community/wallet";

// 1. Generate shield private key
const shieldSignatureMessage = getShieldPrivateKeySignatureMessage();
const shieldPrivateKey = ethers.keccak256(
  ethers.toUtf8Bytes(await signer.signMessage(shieldSignatureMessage))
);

// 2. Estimate gas
const { gasEstimate } = await gasEstimateForShield(
  TXIDVersion.V2_PoseidonMerkle,
  networkName,
  shieldPrivateKey,
  erc20AmountRecipients,
  [], // NFT recipients (empty)
  fromAddress
);

// 3. Populate transaction
const { transaction } = await populateShield(
  TXIDVersion.V2_PoseidonMerkle,
  networkName,
  shieldPrivateKey,
  erc20AmountRecipients,
  [],
  gasDetails
);

// 4. Send transaction
const txResponse = await signer.sendTransaction(transaction);
```

### Transfer Functions (Private → Private)

```typescript
import {
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
} from "@railgun-community/wallet";

// 1. Estimate gas
const { gasEstimate } = await gasEstimateForUnprovenTransfer(
  TXIDVersion.V2_PoseidonMerkle,
  networkName,
  walletID,
  encryptionKey,
  memo,
  erc20AmountRecipients,
  [],
  originalGasDetails,
  undefined, // broadcasterFee (undefined for self-sign)
  true       // sendWithPublicWallet
);

// 2. Generate ZK proof (20-40 seconds)
await generateTransferProof(
  TXIDVersion.V2_PoseidonMerkle,
  networkName,
  walletID,
  encryptionKey,
  true, // showSenderAddressToRecipient
  memo,
  erc20AmountRecipients,
  [],
  undefined,
  true,
  overallBatchMinGasPrice,
  (progress) => console.log(`Proof: ${progress}%`)
);

// 3. Populate proved transaction
const { transaction } = await populateProvedTransfer(
  TXIDVersion.V2_PoseidonMerkle,
  networkName,
  walletID,
  true,
  memo,
  erc20AmountRecipients,
  [],
  undefined,
  true,
  overallBatchMinGasPrice,
  gasDetails
);

// 4. Sign & send
const txResponse = await signer.sendTransaction(transaction);
```

---

## Transaction Flows

### Flow 1: Shield (Public → Private)

```
┌──────────────────┐
│ User's Public    │
│ Wallet (0x...)   │
│                  │
│ Balance: 100 USDC│
└────────┬─────────┘
         │
         │ 1. Approve USDC to RAILGUN
         │ 2. Sign shield message
         │ 3. Send shield tx
         ▼
┌──────────────────┐
│ RAILGUN Contract │
│ (Sepolia Proxy)  │
└────────┬─────────┘
         │
         │ 4. POI Verification (~60s)
         ▼
┌──────────────────┐
│ User's Private   │
│ Wallet (0zk...)  │
│                  │
│ Balance: 100 USDC│ (hidden on-chain)
└──────────────────┘
```

### Flow 2: Private Transfer

```
┌──────────────────┐         ┌──────────────────┐
│ Sender Private   │         │ Receiver Private │
│ Wallet (0zk...)  │         │                  │
│                  │         │                  │
│ Balance: 100 USDC│         │ Balance: 0 USDC  │
└────────┬─────────┘         └────────▲─────────┘
         │                            │
         │ 1. Generate ZK Proof       │
         │ 2. Create encrypted tx     │
         │ 3. Send via signer         │
         │                            │
         └────────────────────────────┘
         
         On-chain data shows NOTHING about:
         - Who sent it
         - Who received it  
         - How much was sent
```

### Flow 3: Unshield (Private → Public)

```
┌──────────────────┐
│ User's Private   │
│ Wallet (0zk...)  │
│                  │
│ Balance: 100 USDC│
└────────┬─────────┘
         │
         │ 1. Generate ZK Proof
         │ 2. Create unshield tx
         ▼
┌──────────────────┐
│ RAILGUN Contract │
└────────┬─────────┘
         │
         │ 3. Transfer to recipient
         ▼
┌──────────────────┐
│ Recipient Public │
│ Wallet (0x...)   │
│                  │
│ Balance: +100 USD│
└──────────────────┘
```

---

## Frontend Integration

### React Hook Example

```typescript
// hooks/useRailgun.ts
import { useState, useEffect } from 'react';
import { engine } from '../railgun/core/engine';
import { walletService } from '../railgun/core/wallet';

export function useRailgun() {
  const [isReady, setIsReady] = useState(false);
  const [railgunWallet, setRailgunWallet] = useState(null);
  const [privateBalance, setPrivateBalance] = useState(BigInt(0));

  useEffect(() => {
    async function init() {
      await engine.initialize();
      await engine.loadNetworkProvider();
      setIsReady(true);
    }
    init();
    
    return () => { engine.shutdown(); };
  }, []);

  const createWallet = async (mnemonic: string, password: string) => {
    const wallet = await walletService.createWalletFromMnemonic(
      mnemonic, password, "UserWallet"
    );
    setRailgunWallet(wallet);
    return wallet;
  };

  const refreshBalance = async (tokenAddress: string) => {
    if (!railgunWallet) return;
    // ... refresh logic
  };

  return { isReady, railgunWallet, privateBalance, createWallet, refreshBalance };
}
```

### Component Example

```tsx
// components/PrivateTransfer.tsx
import { useState } from 'react';
import { useRailgun } from '../hooks/useRailgun';
import { privateTransfer } from '../railgun/services/transfer';

export function PrivateTransfer() {
  const { railgunWallet, privateBalance } = useRailgun();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'proving' | 'sending' | 'done'>('idle');

  const handleTransfer = async () => {
    setStatus('proving');
    
    try {
      setStatus('sending');
      const txHash = await privateTransfer({
        fromWalletID: railgunWallet.walletID,
        toRailgunAddress: recipient,
        tokenAddress: USDC_ADDRESS,
        amount: BigInt(parseFloat(amount) * 1e6),
        signer: getConnectedSigner(),
      });
      
      setStatus('done');
      console.log('TX:', txHash);
    } catch (error) {
      console.error(error);
      setStatus('idle');
    }
  };

  return (
    <div>
      <input 
        placeholder="Recipient 0zk address"
        value={recipient}
        onChange={e => setRecipient(e.target.value)}
      />
      <input 
        placeholder="Amount"
        value={amount}
        onChange={e => setAmount(e.target.value)}
      />
      <button onClick={handleTransfer} disabled={status !== 'idle'}>
        {status === 'proving' ? 'Generating Proof...' : 
         status === 'sending' ? 'Sending...' : 
         status === 'done' ? '✓ Done' : 'Send Private'}
      </button>
      <p>Private Balance: {formatBalance(privateBalance)} USDC</p>
    </div>
  );
}
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Spendable balance is 0` | POI not verified yet | Wait 60-90 seconds after shielding |
| `Bun crashes with worker error` | Bun + snarkjs incompatibility | Use `npx tsx` instead of `bun` |
| `No broadcaster found` | Testnet has few broadcasters | Use self-signing mode |
| `require is not defined` | ESM/CommonJS mismatch | Use `import.meta.url` check |
| `vkey artifact not found` | Artifacts not downloaded | Clear `artifacts/` folder, retry |

### Debug Steps

1. **Check engine status**:
   ```typescript
   console.log('Engine ready:', engine.isReady());
   console.log('Network ready:', engine.isNetworkReady());
   ```

2. **Check balances**:
   ```typescript
   const total = await balanceForERC20Token(..., false);
   const spendable = await balanceForERC20Token(..., true);
   console.log(`Total: ${total}, Spendable: ${spendable}`);
   ```

3. **Clear state and retry**:
   ```bash
   rm -rf engine.db artifacts/
   ```

---

## File Structure

```
railgun-integration/
├── README.md              # This file
├── core/
│   ├── engine.ts          # RAILGUN engine initialization
│   └── wallet.ts          # Wallet creation & management
├── services/
│   ├── shield.ts          # Shield service (public → private)
│   ├── transfer.ts        # Transfer service (private → private)
│   ├── unshield.ts        # Unshield service (private → public)
│   └── waku.ts            # Waku broadcaster service
├── utils/
│   ├── config.ts          # Network configuration
│   ├── logger.ts          # Logging utility
│   └── errors.ts          # Custom error classes
├── types/
│   └── index.ts           # Types re-export
└── testing/
    ├── quick-shield.ts       # Shield script
    ├── self-sign-transfer.ts # Transfer script (self-signed)
    └── waku-transfer.ts      # Transfer script (broadcaster)
```

---

## Support Resources

- [RAILGUN Documentation](https://docs.railgun.org)
- [RAILGUN Wallet SDK](https://github.com/Railgun-Community/wallet)
- [Etherscan Sepolia](https://sepolia.etherscan.io)

---

**License**: MIT

**Version**: 1.0.0

**Last Updated**: 2026-01-29
