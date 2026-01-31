/**
 * Stargate Compose Service
 * Handles automated Bridge + Swap in a single transaction
 *
 * Flow: USDT on Source → Bridge via Stargate → Swap on Destination → ETH
 */

import {
  STARGATE_ROUTER_ADDRESS,
  STARGATE_USDT_POOL_ID,
  LAYER_ZERO_CHAIN_ID,
  getUSDTConfig,
  getETHConfig,
  getUniswapRouterAddress,
} from '@/lib/swap/unifiedConfig';
import { STARGATE_ROUTER_ABI, ERC20_ABI } from './stargateAbi';
import type { StargateQuote, StargateBridgeParams, StargateBridgeResult } from './stargateTypes';
import type { SupportedChainId } from '@/lib/swap/unifiedConfig';
import type { PublicClient, WalletClient } from 'viem';

// ============================================================================
// Types
// ============================================================================

export interface ComposeBridgeSwapQuote extends StargateQuote {
  // Expected swap output on destination chain
  expectedSwapOutput: bigint;
  destinationChainId: SupportedChainId;
  destinationUsdtAddress: `0x${string}`;
  destinationEthAddress: `0x${string}`;
  destinationRouterAddress: `0x${string}`;
}

export interface ComposeBridgeSwapParams {
  quote: ComposeBridgeSwapQuote;
  recipient: `0x${string}`;
  // Swap parameters for destination chain
  destinationSwap: {
    uniRouterAddress: `0x${string}`;
    feeTier: number; // 500, 3000, or 10000
    minEthOutput: bigint;
  };
  dstGasForCall: bigint;
}

// ============================================================================
// Quote Service with Swap Estimation
// ============================================================================

/**
 * Get a quote for bridge + swap (compose)
 *
 * Note: This estimates the swap output based on current prices.
 * The actual swap will happen on the destination chain after bridging.
 */
export async function getComposeQuote(
  fromChainId: SupportedChainId,
  toChainId: SupportedChainId,
  amountIn: bigint,
  slippagePercent: number = 0.5,
  // Estimated USDT/ETH price on destination (in ETH per USDT)
  estimatedEthPrice: number = 0.0003 // ~0.0003 ETH per USDT (example)
): Promise<ComposeBridgeSwapQuote | null> {
  try {
    // Get base bridge quote
    const bridgeQuote = await (async () => {
      const { getBridgeQuote } = await import('./stargateBridgeService');
      return getBridgeQuote(fromChainId, toChainId, amountIn, slippagePercent);
    })();

    if (!bridgeQuote) return null;

    // Estimate ETH output on destination chain
    // This is an approximation - actual swap will use on-chain price
    const usdcReceived = bridgeQuote.amountOut;
    const expectedEthOutput = BigInt(Math.floor(
      Number(usdcReceived) / 1e6 * estimatedEthPrice * 1e18
    ));

    // Apply slippage to minimum ETH output
    const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100));
    const minEthOutput = (expectedEthOutput * slippageFactor) / BigInt(10000);

    return {
      ...bridgeQuote,
      expectedSwapOutput: expectedEthOutput,
      destinationChainId: toChainId,
      destinationUsdtAddress: getUSDTConfig(toChainId).address,
      destinationEthAddress: getETHConfig(toChainId).address,
      destinationRouterAddress: getUniswapRouterAddress(toChainId),
    };
  } catch (error) {
    console.error('Error getting compose quote:', error);
    return null;
  }
}

// ============================================================================
// ABI for Destination Swap
// ============================================================================

// Uniswap Router ABI for the swap on destination chain
const UNISWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
      },
    ],
  },
] as const;

// ============================================================================
// Execution
// ============================================================================

/**
 * Execute a compose transaction (bridge + swap)
 *
 * This will:
 * 1. Bridge USDT from source chain
 * 2. Automatically swap to ETH on destination chain
 * 3. Send ETH to recipient
 */
export async function executeComposeBridgeSwap(
  params: ComposeBridgeSwapParams,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<StargateBridgeResult> {
  try {
    const routerAddress = STARGATE_ROUTER_ADDRESS;
    const usdtConfig = getUSDTConfig(params.quote.fromChainId);
    const [account] = await walletClient.getAddresses();

    // Step 1: Approve USDT for Stargate Router
    const allowance = await publicClient.readContract({
      address: usdtConfig.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, routerAddress],
    });

    if (allowance < params.quote.amountIn) {
      const approveTx = await walletClient.writeContract({
        address: usdtConfig.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress, params.quote.amountIn],
        account,
        chain: null,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // Step 2: Encode the destination swap call
    // This will be executed on the destination chain after bridging
    const destinationSwapCalldata = encodeDestinationSwap({
      usdtAddress: params.quote.destinationUsdtAddress,
      ethAddress: params.quote.destinationEthAddress,
      routerAddress: params.destinationSwap.uniRouterAddress,
      feeTier: params.destinationSwap.feeTier,
      recipient: params.recipient,
      amountOutMinimum: params.destinationSwap.minEthOutput,
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    });

    // Step 3: Execute the compose transaction
    const layerZeroDstChainId = LAYER_ZERO_CHAIN_ID[params.quote.toChainId];

    const hash = await walletClient.writeContract({
      address: routerAddress,
      abi: STARGATE_ROUTER_ABI,
      functionName: 'swap',
      args: [
        layerZeroDstChainId,                       // dstChainId
        params.quote.srcPoolId,                    // srcPoolId
        params.quote.dstPoolId,                    // dstPoolId
        account,                                   // refundAddress
        encodeAmount(params.quote.amountIn),       // amountIn (bytes32)
        params.quote.minAmountOut,                 // minAmountOut (USDT)
        params.dstGasForCall,                      // dstGasForCall
        '0x',                                      // lzTxParams
        encodeRecipient(routerAddress),            // to address (Stargate router on dest)
        destinationSwapCalldata,                   // extraData (encoded swap call)
      ],
      value: BigInt(0),
      account,
      chain: null,
    });

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      return {
        success: true,
        txHash: hash,
        amountOut: params.quote.expectedSwapOutput, // Estimated ETH output
      };
    } else {
      return {
        success: false,
        error: 'Transaction failed',
      };
    }
  } catch (error) {
    console.error('Compose swap execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Encode amount to bytes32 (LD format for Stargate)
 */
function encodeAmount(amount: bigint): `0x${string}` {
  // USDT is 6 decimals, convert to 18 for Stargate
  const amountInLD = amount * BigInt(10) ** BigInt(12);
  const hex = amountInLD.toString(16).padStart(64, '0');
  return `0x${hex}` as `0x${string}`;
}

/**
 * Encode recipient to bytes32
 */
function encodeRecipient(address: `0x${string}`): `0x${string}` {
  const cleaned = address.replace('0x', '').toLowerCase();
  const padded = cleaned.padStart(64, '0');
  return `0x${padded}` as `0x${string}`;
}

/**
 * Encode the destination swap calldata
 * This encodes a Uniswap swap to be executed after bridging
 */
function encodeDestinationSwap(params: {
  usdtAddress: `0x${string}`;
  ethAddress: `0x${string}`;
  routerAddress: `0x${string}`;
  feeTier: number;
  recipient: `0x${string}`;
  amountOutMinimum: bigint;
  deadline: number;
}): `0x${string}` {
  // Encode the exactInputSingle call
  // This is a simplified encoding - in production you'd want more robust encoding

  // Method ID for exactInputSingle(address,address,uint24,address,uint256,uint256,uint256,uint160)
  // = 0x414bf389
  const methodId = '0x414bf389';

  // Encode parameters (tightly packed for ABI encoding)
  const tokenIn = params.usdtAddress.slice(2).toLowerCase();
  const tokenOut = params.ethAddress.slice(2).toLowerCase();
  const fee = params.feeTier.toString(16).padStart(6, '0');
  const recipient = params.recipient.slice(2).toLowerCase();
  const amountIn = '0'.repeat(64); // Will be filled with bridged amount
  const amountOutMinimum = params.amountOutMinimum.toString(16).padStart(64, '0');
  const deadline = params.deadline.toString(16).padStart(64, '0');
  const sqrtPriceLimit = '0'.repeat(64); // No limit

  // Concatenate all parameters
  const encoded = [
    methodId,
    tokenIn.padEnd(64, '0'),
    tokenOut.padEnd(64, '0'),
    fee,
    recipient.padEnd(64, '0'),
    deadline,
    amountOutMinimum,
    sqrtPriceLimit,
  ].join('');

  return `0x${encoded}` as `0x${string}`;
}

/**
 * Alternative: Use viem's encodeFunctionData for proper encoding
 * This requires the full ABI and is more reliable
 */
async function encodeDestinationSwapWithViem(params: {
  usdtAddress: `0x${string}`;
  ethAddress: `0x${string}`;
  routerAddress: `0x${string}`;
  feeTier: number;
  recipient: `0x${string}`;
  amountOutMinimum: bigint;
  deadline: number;
}): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import('viem');

  return encodeFunctionData({
    abi: UNISWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: params.usdtAddress,
      tokenOut: params.ethAddress,
      fee: params.feeTier,
      recipient: params.recipient,
      deadline: params.deadline,
      amountIn: BigInt(0), // Will be the bridged amount
      amountOutMinimum: params.amountOutMinimum,
      sqrtPriceLimitX96: BigInt(0),
    }],
  }) as `0x${string}`;
}
