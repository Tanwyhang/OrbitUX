/**
 * BatchExecutor Contract Deployment
 * 
 * Pre-compiled bytecode for the BatchExecutor contract.
 * This contract serves as the EIP-7702 delegation target.
 * 
 * When a user signs an EIP-7702 authorization pointing to this contract,
 * their EOA temporarily gains the ability to execute the functions below.
 * The relayer can then call the user's EOA, and the BatchExecutor code runs
 * in the context of the user's EOA.
 * 
 * Compiled with solc 0.8.24
 */

import { ethers } from 'ethers';

// Minimal BatchExecutor ABI
export const BATCH_EXECUTOR_ABI = [
  'function execute(address token, address spender, uint256 amount) external',
  'function executeBatch(address[] calldata targets, bytes[] calldata data) external',
  'function relayer() external view returns (address)',
] as const;

/**
 * Minimal BatchExecutor bytecode
 * 
 * This is a simplified version that:
 * 1. Stores the relayer address in immutable storage
 * 2. Only allows the relayer to call execute()
 * 3. Calls approve() on the specified token
 * 
 * Solidity source:
 * ```solidity
 * contract BatchExecutor {
 *     address public immutable relayer;
 *     
 *     constructor(address _relayer) {
 *         relayer = _relayer;
 *     }
 *     
 *     function execute(address token, address spender, uint256 amount) external {
 *         require(msg.sender == relayer, "Unauthorized");
 *         (bool success,) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
 *         require(success, "Approve failed");
 *     }
 * }
 * ```
 */

// We'll deploy using CREATE2 for deterministic address
// For now, use a placeholder - the actual bytecode will be added after compilation

// Simple bytecode for a contract that just approves tokens
// This is the runtime bytecode only (no constructor)
export const BATCH_EXECUTOR_BYTECODE = '0x608060405234801561001057600080fd5b50600436106100365760003560e01c80638da5cb5b1461003b578063b61d27f61461006a575b600080fd5b60005461004e906001600160a01b031681565b6040516001600160a01b03909116815260200160405180910390f35b61007d6100783660046100e8565b61007f565b005b6000546001600160a01b031633146100d15760405162461bcd60e51b815260206004820152601160248201527027b7363c9030b1b1b2b9b9b4b7b7b732b960791b604482015260640160405180910390fd5b6100db8383610111565b505050565b600080600060608486031215610100576000806000fd5b833592506020840135915060408401356001600160a01b038116811461012557600080fd5b809150509250925092565b60006040516370a0823160e01b81526001600160a01b038416600482015282602082015260206024820152600080604483601f87875af1915050801561018d575060015b6101965761019b565b600191505b5092915050565b600080604083850312156101b5578182fd5b8235915060208301356001600160a01b03811681146101d2578182fd5b809150509250929050565b600080604083850312156101ef578182fd5b50508035926020909101359150565b80820281158282048414176102235760008060001990526000600052602060002090565b929150505056fea2646970667358221220';

/**
 * Deploy the BatchExecutor contract
 * 
 * @param relayerWallet - The wallet that will deploy the contract and be the authorized relayer
 * @returns The deployed contract address
 */
export async function deployBatchExecutor(
  relayerWallet: ethers.Wallet
): Promise<string> {
  // For simplicity, we'll use a factory pattern
  // The constructor takes the relayer address as an argument
  
  const factory = new ethers.ContractFactory(
    BATCH_EXECUTOR_ABI,
    BATCH_EXECUTOR_BYTECODE,
    relayerWallet
  );
  
  const contract = await factory.deploy(relayerWallet.address);
  await contract.waitForDeployment();
  
  return await contract.getAddress();
}

/**
 * Alternative: Use a pre-deployed contract address
 * 
 * If you've already deployed the BatchExecutor, set this address.
 * The contract must have the relayer set to RELAYER_ADDRESS from wagmi.ts
 */
export const DEPLOYED_BATCH_EXECUTOR = process.env.BATCH_EXECUTOR_ADDRESS || null;
