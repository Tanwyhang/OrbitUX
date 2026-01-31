# Standardized Privacy Layer for DeFi

## Architecture Overview

This is a **universal privacy layer** that can work with **any DEX contract**. The key insight is that the relayer signs transactions on behalf of the user after the RAILGUN unshielding, which means we can interact with ANY contract while keeping transactions private.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER ACTION                                │
│  Signs permit (gasless approval)                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       RELAYER ACTION                                │
│  1. Pull tokens from user                                           │
│  2. Shield to RAILGUN                                               │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    RAILGUN PRIVACY LAYER                            │
│  3. Wait for POI (Proof of Innocence)                              │
│  4. Generate ZK Proof                                              │
│  5. Unshield to Relayer                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     DEX ABSTRACTION LAYER                           │
│  6. Execute swap on ANY DEX via adapter                            │
│     - Uniswap V3 (SwapRouter)                                      │
│     - Curve (StableSwap)                                           │
│     - Balancer (Vault)                                             │
│     - Custom Pools                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         RESULT                                      │
│  7. Send output tokens to user                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Innovation

**Privacy is a universal layer on top of DeFi**

- Users get the **best prices** from any DEX (Uniswap, Curve, etc.)
- Transactions remain **private** through RAILGUN
- The relayer can interact with **any contract** after unshielding
- No need to deploy custom liquidity pools

## Components

### 1. DEX Adapter Interface (`IDexAdapter`)

Standardized interface that all DEXs must implement:

```typescript
interface IDexAdapter {
  name: string;
  id: string;

  // Get a quote for the swap
  getQuote(params: DexSwapParams): Promise<DexQuote | null>;

  // Execute the swap (called by relayer after unshielding)
  executeSwap(
    contract: Contract,
    params: DexSwapParams,
    dexSpecificData: any,
    gasDetails: TransactionGasDetails
  ): Promise<DexSwapResult>;

  // Get contract address for this chain
  getContractAddress(chainId: number): string;

  // Get contract ABI
  getContractABI(): any[];
}
```

### 2. Uniswap V3 Adapter (`UniswapV3Adapter`)

Implementation for Uniswap V3 SwapRouter:
- Uses `QuoterV2` for accurate quotes
- Supports multiple fee tiers (0.05%, 0.3%, 1%)
- Executes via `exactInputSingle` function

### 3. Standardized Private Swap Service

Orchestrates the entire flow:
- Handles permit and token pulling
- Manages RAILGUN shield/unshield
- Waits for POI
- Generates ZK proofs
- Calls DEX adapter for swap execution

## Example Usage

```typescript
import { UniswapV3Adapter } from '@/lib/swap/dex';
import { standardizedPrivateSwapService } from '@/lib/swap/dex';

// Create DEX adapter
const dexAdapter = new UniswapV3Adapter(provider, chainId);

// Get quote
const quote = await standardizedPrivateSwapService.getDexQuote({
  inputTokenAddress: '0x...',
  outputTokenAddress: '0x...',
  inputAmount: BigInt('1000000000000000000'),
  minimumOutput: BigInt('0'),
  recipientAddress: userAddress,
  slippage: 0.5,
}, dexAdapter);

// Execute private swap
const result = await standardizedPrivateSwapService.executePrivateSwap({
  senderWalletID: walletID,
  senderEncryptionKey: encryptionKey,
  senderRailgunAddress: railgunAddress,
  userAddress: '0x...',
  inputTokenAddress: '0x...',
  outputTokenAddress: '0x...',
  inputAmount: BigInt('1000000000000000000'),
  minimumOutput: quote.minimumReceived,
  inputTokenDecimals: 18,
  outputTokenDecimals: 18,
  slippage: 0.5,
  dexAdapter,
  onProgress: (progress) => console.log(progress),
});
```

## Benefits

1. **Privacy**: All transactions are private through RAILGUN
2. **Best Execution**: Access to any DEX's liquidity
3. **Modularity**: Easy to add new DEXs via adapter pattern
4. **Gas Efficiency**: Relayer sponsors gas, users sign permits
5. **Flexibility**: Can interact with ANY contract, not just DEXs

## Future DEX Adapters

Potential adapters to implement:

- **Curve**: For stablecoin swaps with low slippage
- **Balancer**: for multi-asset pools
- **1inch**: For best route aggregation
- **CowSwap**: For MEV protection
- **Aave/Compound**: For private lending/borrowing
- **Any Custom Contract**: The pattern works for ANY contract interaction

## Security Considerations

1. **Relayer Trust**: Users must trust the relayer to:
   - Actually execute the swap
   - Send output to the correct address
   - Not front-run the transaction

2. **Permit Security**: Gasless permits are powerful but require:
   - Proper deadline management
   - Secure nonce handling
   - Revocation mechanism

3. **Slippage Protection**: Users must set appropriate slippage tolerance

## Related Files

- `/lib/swap/dex/adapters/DEXAdapter.ts` - Interface definition
- `/lib/swap/dex/adapters/UniswapV3Adapter.ts` - Uniswap implementation
- `/lib/swap/dex/standardizedPrivateSwap.ts` - Orchestration service
- `/lib/swap/dex/index.ts` - Module exports
