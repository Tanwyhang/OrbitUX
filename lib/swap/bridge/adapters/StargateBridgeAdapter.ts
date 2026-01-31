/**
 * Stargate Bridge Adapter
 *
 * Implements IBridgeAdapter for Stargate cross-chain bridges
 * Supports:
 * - Bridge only: USDT → USDT across chains
 * - Bridge + swap: USDT → ETH across chains (compose)
 */

import { ethers, Contract, Provider, Wallet } from 'ethers';
import type { IBridgeAdapter, BridgeQuoteParams, BridgeQuote, BridgeExecuteParams, BridgeResult, BridgeDelivery } from '../../privateBridgeTypes';
import type { SupportedChainId } from '../../unifiedConfig';
import { STARGATE_ROUTER_ADDRESS, STARGATE_USDT_POOL_ID, LAYER_ZERO_CHAIN_ID } from '../../unifiedConfig';
import { STARGATE_ROUTER_ABI, ERC20_ABI } from '../../stargate/stargateAbi';

/**
 * Stargate Bridge Adapter
 */
export class StargateBridgeAdapter implements IBridgeAdapter {
  readonly name = 'Stargate';
  readonly id = 'stargate';

  /**
   * Get bridge quote
   */
  async getQuote(params: BridgeQuoteParams): Promise<BridgeQuote | null> {
    try {
      const { sourceChainId, destinationChainId, inputAmount, slippage } = params;

      // Validate chains are different
      if (sourceChainId === destinationChainId) {
        throw new Error('Cannot bridge to same chain');
      }

      // Calculate bridge fee (0.06%)
      const BRIDGE_FEE_PERCENTAGE = 0.0006;
      const bridgeFee = (inputAmount * BigInt(Math.floor(BRIDGE_FEE_PERCENTAGE * 10000))) / BigInt(10000);
      const outputAmount = inputAmount - bridgeFee;

      // Minimum with slippage
      const slippageFactor = BigInt(Math.floor((100 - slippage) * 100));
      const minAmountOut = (outputAmount * slippageFactor) / BigInt(10000);

      // Estimate bridge time
      const estimatedDuration = 300; // 5 minutes

      // If bridge + swap, estimate output
      let swapOutputAmount: bigint | undefined;
      if (params.outputTokenAddress && params.outputTokenAddress !== params.inputTokenAddress) {
        // Simple estimate: assume 1 USDT = 0.0003 ETH (should use price oracle)
        // outputAmount is in USDT decimals (6), convert to ETH decimals (18)
        const outputAmountNumber = Number(outputAmount) / 1e6;
        swapOutputAmount = BigInt(Math.floor(outputAmountNumber * 0.0003 * 1e18));
      }

      return {
        sourceChainId,
        destinationChainId,
        inputAmount,
        outputAmount,
        swapOutputAmount,
        minimumOutput: swapOutputAmount || minAmountOut,
        bridgeFee,
        estimatedDuration,
        priceImpact: (Number(bridgeFee) / Number(inputAmount)) * 100,
      };
    } catch (error) {
      console.error('[StargateAdapter] Quote error:', error);
      return null;
    }
  }

  /**
   * Execute bridge transaction
   * Called by relayer on source chain
   */
  async executeBridge(
    params: BridgeExecuteParams,
    gasDetails: any
  ): Promise<BridgeResult> {
    try {
      const { sourceChainId, destinationChainId, inputTokenAddress, inputAmount, minimumOutput, recipientAddress } = params;

      console.log('[StargateAdapter] Executing bridge:', {
        from: sourceChainId,
        to: destinationChainId,
        amount: inputAmount.toString(),
      });

      // Get relayer wallet and provider from relayer service
      const { relayerService } = await import('@/lib/railgun/relayer');
      const relayerWallet = relayerService.getWallet();
      const provider = relayerService.getProvider();

      const routerAddress = STARGATE_ROUTER_ADDRESS;
      const srcPoolId = BigInt(STARGATE_USDT_POOL_ID[sourceChainId]);
      const dstPoolId = BigInt(STARGATE_USDT_POOL_ID[destinationChainId]);
      const layerZeroDstChainId = BigInt(LAYER_ZERO_CHAIN_ID[destinationChainId]);

      const tokenContract = new Contract(inputTokenAddress, ERC20_ABI, relayerWallet);
      const routerContract = new Contract(routerAddress, STARGATE_ROUTER_ABI, relayerWallet);

      // Check and approve tokens if needed
      const allowance = await tokenContract.allowance(relayerWallet.address, routerAddress);
      if (allowance < inputAmount) {
        console.log('[StargateAdapter] Approving router...');
        const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      // Encode amount to bytes32 format (convert 6 decimals to 18 decimals)
      const amountInLD = inputAmount * BigInt(10) ** BigInt(12);
      const amountInBytes32 = ethers.zeroPadValue(ethers.toBeHex(amountInLD), 32);

      // Encode recipient address to bytes
      const recipientBytes = ethers.zeroPadValue(recipientAddress, 32);

      // Execute bridge transaction
      console.log('[StargateAdapter] Calling Stargate swap...');
      const tx = await routerContract.swap(
        layerZeroDstChainId,              // dstChainId (LayerZero ID)
        srcPoolId,                        // srcPoolId
        dstPoolId,                        // dstPoolId
        relayerWallet.address,            // refundAddress
        amountInBytes32,                  // amountIn (as bytes32)
        minimumOutput,                    // minAmountOut
        0,                                // dstGasForCall (0 for simple bridge)
        '0x',                            // lzTxParams (empty)
        recipientBytes,                   // to address (as bytes)
        '0x',                             // extraData (empty)
        { gasLimit: 500000 }
      );

      const receipt = await tx.wait();

      if (receipt!.status === 1) {
        return {
          success: true,
          txHash: tx.hash,
          estimatedArrival: Date.now() + 300000, // 5 minutes from now
        };
      } else {
        return {
          success: false,
          estimatedArrival: 0,
          error: 'Bridge transaction failed',
        };
      }
    } catch (error) {
      console.error('[StargateAdapter] Execution error:', error);
      return {
        success: false,
        estimatedArrival: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wait for bridge completion
   *
   * Polls destination chain for the bridged tokens
   * Stargate handles the delivery automatically via LayerZero
   */
  async waitForBridge(
    bridgeTxHash: string,
    sourceChainId: SupportedChainId,
    destinationChainId: SupportedChainId,
    recipientAddress?: string
  ): Promise<BridgeDelivery> {
    console.log('[StargateAdapter] Waiting for bridge delivery...');

    // Get relayer service to access provider
    const { relayerService } = await import('@/lib/railgun/relayer');
    const provider = relayerService.getProvider();
    const { getUSDTConfig } = await import('@/lib/swap/unifiedConfig');

    const maxWaitTime = 600000; // 10 minutes
    const pollInterval = 15000; // 15 seconds
    const startTime = Date.now();

    // Get USDT config for destination chain
    const destTokenConfig = getUSDTConfig(destinationChainId);
    const tokenContract = new Contract(destTokenConfig.address, ERC20_ABI, provider);

    // Get initial balance
    let initialBalance = BigInt(0);
    if (recipientAddress) {
      try {
        initialBalance = await tokenContract.balanceOf(recipientAddress);
      } catch (error) {
        console.warn('[StargateAdapter] Could not get initial balance:', error);
      }
    }

    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      if (recipientAddress) {
        try {
          const currentBalance = await tokenContract.balanceOf(recipientAddress);
          const received = currentBalance - initialBalance;

          if (received > 0) {
            console.log('[StargateAdapter] Bridge delivery confirmed:', received.toString());
            return {
              success: true,
              destinationChainId,
              outputAmount: received,
              outputTokenAddress: destTokenConfig.address,
            };
          }
        } catch (error) {
          console.warn('[StargateAdapter] Poll error:', error);
        }
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[StargateAdapter] Still waiting... (${elapsed}s elapsed)`);
    }

    return {
      success: false,
      destinationChainId,
      outputAmount: BigInt(0),
      outputTokenAddress: destTokenConfig.address,
      error: 'Bridge delivery timeout',
    };
  }
}
