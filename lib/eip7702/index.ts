/**
 * EIP-7702 Gas Abstraction Utilities
 * 
 * This module provides utilities for EIP-7702 (Set Code for EOAs) which enables
 * full gas abstraction for private transfers. Users sign an authorization that
 * temporarily delegates their EOA to a smart contract, allowing the relayer to
 * execute operations on their behalf without the user paying any gas.
 * 
 * Flow:
 * 1. User signs an EIP-7702 authorization (gasless signature)
 * 2. Relayer submits Type 4 transaction with the authorization
 * 3. User's EOA temporarily delegates to BatchExecutor contract
 * 4. Relayer calls user's EOA, which executes the delegated code
 * 5. The approval runs in user's context, so USDC.approve() comes from user
 * 
 * Fallback: If wallet doesn't support 7702, use EIP-2612 permit
 */

import { 
  hashAuthorization, 
  recoverAuthorizationAddress,
  serializeAuthorizationList,
  type Authorization,
  type SignedAuthorization 
} from 'viem/experimental';
import { 
  type Address, 
  type Hex,
  type WalletClient,
  keccak256,
  encodePacked,
  encodeAbiParameters,
  parseAbiParameters
} from 'viem';

// BatchExecutor contract address (to be deployed)
export const BATCH_EXECUTOR_ADDRESS = '0x0000000000000000000000000000000000000000' as const; // TODO: Deploy and update

// Chain ID for Sepolia
export const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Prepare an EIP-7702 authorization for signing
 * The user will sign this to allow their EOA to delegate to BatchExecutor
 */
export function prepareAuthorization(
  userAddress: Address,
  nonce: bigint
): Authorization {
  return {
    chainId: SEPOLIA_CHAIN_ID,
    address: BATCH_EXECUTOR_ADDRESS,
    nonce: Number(nonce),
  };
}

/**
 * Get the message hash that needs to be signed for EIP-7702 authorization
 * This can be signed using eth_sign or personal_sign
 */
export function getAuthorizationHash(authorization: Authorization): Hex {
  return hashAuthorization(authorization);
}

/**
 * Sign an EIP-7702 authorization using a wallet client
 * Returns a signed authorization that can be included in a Type 4 transaction
 * 
 * Note: This uses personal_sign which adds the Ethereum signed message prefix.
 * We need to handle this appropriately on the verification side.
 */
export async function signAuthorizationWithWallet(
  walletClient: WalletClient,
  authorization: Authorization
): Promise<SignedAuthorization> {
  const hash = hashAuthorization(authorization);
  
  // Request signature from wallet
  // We use signMessage which internally uses personal_sign
  // The wallet will show this as a message signing request
  const signature = await walletClient.signMessage({
    account: walletClient.account!,
    message: { raw: hash },
  });
  
  // Parse the signature into v, r, s components
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);
  
  // Convert v to yParity (0 or 1)
  // For EIP-7702, yParity is 0 for even v, 1 for odd v
  const yParity = v % 2;
  
  return {
    ...authorization,
    r,
    s,
    yParity,
  };
}

/**
 * Verify a signed authorization recovers to the expected address
 */
export async function verifyAuthorization(
  signedAuth: SignedAuthorization,
  expectedAddress: Address
): Promise<boolean> {
  try {
    const recovered = await recoverAuthorizationAddress({ 
      authorization: signedAuth 
    });
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Check if a wallet supports EIP-7702 signing
 * This is a heuristic check - we try to detect if the wallet can sign authorizations
 */
export async function supportsEIP7702(walletClient: WalletClient): Promise<boolean> {
  try {
    // Check if wallet supports the experimental methods
    // Most wallets don't yet, so we'll return false and fall back to permit
    const capabilities = await walletClient.request({
      method: 'wallet_getCapabilities' as any,
      params: [],
    }).catch(() => null);
    
    if (capabilities && typeof capabilities === 'object') {
      // Check for 7702 capability flag
      return '7702' in capabilities || 'eip7702' in capabilities;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Encode the execute function call for BatchExecutor
 */
export function encodeExecuteCall(
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint
): Hex {
  // Function signature: execute(address token, address spender, uint256 amount)
  const functionSelector = keccak256(
    encodePacked(['string'], ['execute(address,address,uint256)'])
  ).slice(0, 10) as Hex;
  
  const params = encodeAbiParameters(
    parseAbiParameters('address, address, uint256'),
    [tokenAddress, spenderAddress, amount]
  );
  
  return `${functionSelector}${params.slice(2)}` as Hex;
}

/**
 * EIP-2612 Permit types for USDC
 * Fallback for wallets that don't support EIP-7702
 */
export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/**
 * Create the domain for USDC permit on Sepolia
 */
export function getUSDCPermitDomain() {
  return {
    name: 'USDC',
    version: '2',
    chainId: SEPOLIA_CHAIN_ID,
    verifyingContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  };
}

/**
 * Request a permit signature from the wallet
 * This is the fallback for when EIP-7702 is not supported
 */
export interface PermitSignature {
  v: number;
  r: Hex;
  s: Hex;
  deadline: bigint;
}

export async function signPermit(
  walletClient: WalletClient,
  owner: Address,
  spender: Address,
  value: bigint,
  nonce: bigint,
  deadline: bigint
): Promise<PermitSignature> {
  const domain = getUSDCPermitDomain();
  
  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: {
      owner,
      spender,
      value,
      nonce,
      deadline,
    },
  });
  
  // Parse signature
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);
  
  return { v, r, s, deadline };
}

export type GasAbstractionMethod = 'eip7702' | 'permit' | 'none';

/**
 * Determine the best gas abstraction method for the current wallet
 */
export async function detectGasAbstractionMethod(
  walletClient: WalletClient | null
): Promise<GasAbstractionMethod> {
  if (!walletClient) return 'none';
  
  // First try EIP-7702
  if (await supportsEIP7702(walletClient)) {
    return 'eip7702';
  }
  
  // Fall back to permit (USDC supports EIP-2612)
  return 'permit';
}
