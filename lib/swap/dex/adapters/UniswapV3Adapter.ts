/**
 * Uniswap V3 DEX Adapter
 *
 * Implements the DEX adapter interface for Uniswap V3 SwapRouter
 * This allows the privacy layer to execute private swaps on Uniswap
 */

import { Contract } from 'ethers';
import { EVMGasType, type TransactionGasDetails } from '@railgun-community/shared-models';
import type {
  IDexAdapter,
  DexSwapParams,
  DexQuote,
  DexSwapResult,
} from './DEXAdapter';

// Uniswap V3 SwapRouter ABI (exactInputSingle function)
const UNISWAP_V3_ROUTER_ABI = [
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

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
];

// Uniswap Quoter V2 ABI for getting quotes
const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'quoteExactInputSingle',
        outputs: [
          { name: 'amountOut', type: 'uint256' },
          { name: 'sqrtPriceX96After', type: 'uint160' },
          { name: 'initializedTicksCrossed', type: 'uint32' },
          { name: 'gasEstimate', type: 'uint256' },
        ],
        stateMutability: 'function',
        type: 'function',
      },
    ],
  },
] as const;

// Uniswap V3 Factory ABI for finding pools
const FACTORY_ABI = [
  {
    inputs: [
      { name: 'fee', type: 'uint24' },
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Pool ABI for checking liquidity
const POOL_ABI = [
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Contract addresses by chain
const ROUTER_ADDRESSES: Record<number, string> = {
  1: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',     // Ethereum Mainnet
  11155111: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Sepolia
  42161: '0xE592427A0AEce92De3Edee1F18E0157C05861564',    // Arbitrum
  137: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',     // Polygon
};

const QUOTER_ADDRESSES: Record<number, string> = {
  1: '0x61fFE014bA17989E743c5F6cB21bF9697530C21',     // Ethereum Mainnet
  11155111: '0xEd1C6c1c7c3A67D27F244de724D2993916c3A9b9', // Sepolia
  42161: '0x31d6197b846032ed9fc0aa368c91b845c70da5f8',    // Arbitrum
  137: '0x27F6D29F78C752a5cd5fD67142c79Ffa7118849e',     // Polygon
};

const FACTORY_ADDRESSES: Record<number, string> = {
  1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  11155111: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
  42161: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  137: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
};

// Fee tiers to try: 0.05%, 0.3%, 1%
const FEE_TIERS = [500, 3000, 10000] as const;

/**
 * Uniswap V3 DEX Adapter
 */
export class UniswapV3Adapter implements IDexAdapter {
  readonly name = 'Uniswap V3';
  readonly id = 'uniswap-v3';

  private provider: any;
  private chainId: number;

  constructor(provider: any, chainId: number) {
    this.provider = provider;
    this.chainId = chainId;
  }

  /**
   * Get Uniswap quote using QuoterV2 contract
   */
  async getQuote(params: DexSwapParams): Promise<DexQuote | null> {
    const {
      inputTokenAddress,
      outputTokenAddress,
      inputAmount,
      minimumOutput: userMinimumOutput,
      slippage,
    } = params;

    // Validate inputs
    if (inputAmount <= BigInt(0)) {
      throw new Error('Amount must be greater than 0');
    }

    if (inputTokenAddress.toLowerCase() === outputTokenAddress.toLowerCase()) {
      throw new Error('Cannot swap token for itself');
    }

    const quoterAddress = QUOTER_ADDRESSES[this.chainId];
    const factoryAddress = FACTORY_ADDRESSES[this.chainId];

    if (!quoterAddress || !factoryAddress) {
      throw new Error(`Uniswap not supported on chain ${this.chainId}`);
    }

    // Try each fee tier to find the best pool
    for (const fee of FEE_TIERS) {
      try {
        // Get pool address
        const factoryContract = new Contract(factoryAddress, FACTORY_ABI, this.provider);
        const [token0, token1] = this.sortTokens(inputTokenAddress, outputTokenAddress);
        const poolAddress = await factoryContract.getPool(fee, token0, token1);

        if (poolAddress === '0x0000000000000000000000000000000000000000') {
          continue; // Pool doesn't exist
        }

        // Check liquidity
        const poolContract = new Contract(poolAddress, POOL_ABI, this.provider);
        const liquidity = await poolContract.liquidity();

        if (liquidity === BigInt(0)) {
          continue; // No liquidity
        }

        // Get quote from Quoter V2
        const quoterContract = new Contract(quoterAddress, QUOTER_V2_ABI, this.provider);
        const result = await quoterContract.quoteExactInputSingle({
          tokenIn: inputTokenAddress,
          tokenOut: outputTokenAddress,
          fee,
          amountIn: inputAmount,
          sqrtPriceLimitX96: BigInt(0),
        });

        const outputAmount = result.amountOut;
        const estimatedGas = result.gasEstimate;

        if (outputAmount === BigInt(0)) {
          continue;
        }

        // Calculate execution price (output per input)
        const executionPrice = Number(outputAmount) / Number(inputAmount);

        // Simplified price impact calculation
        const priceImpact = 0.1; // TODO: Calculate actual price impact

        // Use user-provided minimum or calculate from slippage
        const minimumReceived = userMinimumOutput || this.calculateMinimumReceived(outputAmount, slippage);

        return {
          inputAmount,
          outputAmount,
          minimumReceived,
          priceImpact,
          executionPrice,
          estimatedGas,
          dexSpecificData: {
            fee,
            poolAddress,
          },
        };

      } catch (error) {
        // Pool doesn't exist or quote failed, try next fee tier
        continue;
      }
    }

    return null; // No route found
  }

  /**
   * Execute swap on Uniswap V3
   * Called by the relayer after privacy layer unshields tokens
   */
  async executeSwap(
    contract: Contract,
    params: DexSwapParams,
    dexSpecificData: any,
    gasDetails: TransactionGasDetails
  ): Promise<DexSwapResult> {
    const {
      inputTokenAddress,
      outputTokenAddress,
      inputAmount,
      minimumOutput,
      recipientAddress,
    } = params;

    const { fee } = dexSpecificData;

    // Calculate deadline (20 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 1200;

    try {
      // Build swap parameters
      const swapParams = {
        tokenIn: inputTokenAddress,
        tokenOut: outputTokenAddress,
        fee,
        recipient: recipientAddress,
        deadline,
        amountIn: inputAmount,
        amountOutMinimum: minimumOutput,
        sqrtPriceLimitX96: BigInt(0),
      };

      // Build transaction options based on gas details type
      const txOptions: any = {
        gasLimit: gasDetails.gasEstimate || BigInt(300000),
      };

      // Add EIP-1559 gas params if using Type2
      if (gasDetails.evmGasType === EVMGasType.Type2) {
        txOptions.maxFeePerGas = gasDetails.maxFeePerGas;
        txOptions.maxPriorityFeePerGas = gasDetails.maxPriorityFeePerGas;
      } else if (gasDetails.evmGasType === EVMGasType.Type0) {
        txOptions.gasPrice = gasDetails.gasPrice;
      }

      // Execute swap
      const tx = await contract.exactInputSingle(swapParams, txOptions);

      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.hash,
        // Note: We'd need to parse the receipt to get actual output amount
        // For now, return the minimum expected
        outputAmount: minimumOutput,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get Uniswap SwapRouter address for this chain
   */
  getContractAddress(chainId: number): string {
    return ROUTER_ADDRESSES[chainId] || ROUTER_ADDRESSES[1];
  }

  /**
   * Get Uniswap SwapRouter ABI
   */
  getContractABI(): any[] {
    return [...UNISWAP_V3_ROUTER_ABI] as any[];
  }

  /**
   * Get ERC20 ABI for approvals
   */
  getERC20ABI(): any[] {
    return ERC20_ABI;
  }

  /**
   * Sort tokens for Uniswap (token0 < token1)
   */
  private sortTokens(tokenA: string, tokenB: string): [string, string] {
    return tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  }

  /**
   * Calculate minimum received after slippage
   */
  private calculateMinimumReceived(outputAmount: bigint, slippagePercent: number): bigint {
    if (outputAmount === BigInt(0)) return BigInt(0);
    const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 10000));
    const divisor = BigInt(1000000);
    return (outputAmount * slippageMultiplier) / divisor;
  }
}
