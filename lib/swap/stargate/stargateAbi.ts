/**
 * Stargate Router ABI
 * Simplified version with only the functions we need
 */

export const STARGATE_ROUTER_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "_dstChainId",
        "type": "uint16"
      },
      {
        "internalType": "uint256",
        "name": "_srcPoolId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_dstPoolId",
        "type": "uint256"
      },
      {
        "internalType": "address payable",
        "name": "_refundAddress",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "_amountIn",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "_amountOut",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_dstGasForCall",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "_lzTxParams",
        "type": "bytes"
      },
      {
        "internalType": "bytes",
        "name": "_to",
        "type": "bytes"
      },
      {
        "internalType": "bytes",
        "name": "_extraData",
        "type": "bytes"
      }
    ],
    "name": "swap",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "_dstChainId",
        "type": "uint16"
      },
      {
        "internalType": "uint256",
        "name": "_srcPoolId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_dstPoolId",
        "type": "uint256"
      },
      {
        "internalType": "address payable",
        "name": "_refundAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_amountLD",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_minAmountLD",
        "type": "uint256"
      }
    ],
    "name": "swapRemote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lzEndpoint",
    "outputs": [
      {
        "internalType": "contract ILayerZeroEndpoint",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "_chainId",
        "type": "uint16"
      }
    ],
    "name": "layerZeroChainId",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
] as const;

// Stargate Pool ABI for token approval checks
export const STARGATE_POOL_ABI = [
  {
    "inputs": [],
    "name": "token",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_poolId",
        "type": "uint256"
      }
    ],
    "name": "poolId",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
] as const;

// ERC20 ABI for token operations
export const ERC20_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
] as const;
