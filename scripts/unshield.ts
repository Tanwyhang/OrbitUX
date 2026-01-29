#!/usr/bin/env bun

import { ethers } from 'ethers'
import {
  RailgunWallet,
  loadRailgunWallet,
  setTransactionCache,
  POIRequired,
  ProvingMode,
  RailgunWalletBalance,
} from '@railgun-community/wallet'
import {
  NetworkName,
  TXVersion,
  TokenType,
  getTokenData,
} from '@railgun-community/shared-models'
import {
  getBalances,
  createTransaction,
  prove,
  publishTransaction,
} from '@railgun-community/engine'
import { config as dotenvConfig } from 'dotenv'
import { readFileSync } from 'fs'

dotenvConfig({ path: '.env' })

const SEPOLIA_PROVIDER_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.ankr.com/eth_sepolia'
const PRIVATE_KEY = process.env.PRIVATE_KEY || ''
const WALLET_MNEMONIC = process.env.WALLET_MNEMONIC || ''
const RAILGUN_WALLET_NAME = 'railgun-demo-wallet'
const RAILGUN_WALLET_ID = '0zk1234abcd5678'

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

type LogLevel = 'info' | 'success' | 'warning' | 'error'

const colors = {
  reset: '\x1b[0m',
  info: '\x1b[36m',
  success: '\x1b[32m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  bold: '\x1b[1m',
  cyan: '\x1b[96m',
  magenta: '\x1b[35m',
}

function log(message: string, level: LogLevel = 'info') {
  const timestamp = new Date().toISOString()
  const color = colors[level] || colors.info
  console.log(`${color}${colors.bold}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`)
}

function logSeparator() {
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`)
}

function logStep(step: number, total: number, title: string) {
  logSeparator()
  console.log(`${colors.bold}${colors.magenta}STEP ${step}/${total}: ${title}${colors.reset}`)
  logSeparator()
}

function formatAddress(address: string, length: number = 8): string {
  return `${address.slice(0, length)}...${address.slice(-length)}`
}

function formatAddressFull(address: string): string {
  return `${address.slice(0, 10)}...${address.slice(-10)}`
}

let provider: ethers.JsonRpcProvider
let signer: ethers.Wallet
let railgunWallet: RailgunWallet

async function initialize(): Promise<void> {
  logStep(1, 6, 'Initialize RAILGUN Engine & Wallet')
  
  provider = new ethers.JsonRpcProvider(SEPOLIA_PROVIDER_URL)
  log(`Connected to Sepolia provider: ${SEPOLIA_PROVIDER_URL}`)

  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in environment')
  }

  signer = new ethers.Wallet(PRIVATE_KEY, provider)
  const publicAddress = await signer.getAddress()
  log(`Public wallet address: ${publicAddress}`)

  const network = NetworkName.Sepolia

  log('Loading RAILGUN wallet...')
  try {
    railgunWallet = await loadRailgunWallet(
      RAILGUN_WALLET_ID,
      RAILGUN_WALLET_NAME,
      [WALLET_MNEMONIC],
      0,
      undefined,
    )
    log(`RAILGUN wallet loaded: ${RAILGUN_WALLET_ID}`, 'success')
    log(`0zk address: ${formatAddress(railgunWallet.railgunWalletID, 12)}`)
  } catch (error) {
    throw new Error(`Failed to load RAILGUN wallet: ${error}`)
  }

  await setTransactionCache()
  log('Transaction cache set up', 'success')

  log('', 'info')
}

async function checkBalance(): Promise<bigint> {
  logStep(2, 6, 'Check Private Balance')

  const network = NetworkName.Sepolia
  const tokenData = getTokenData(TokenType.ERC20, USDC_ADDRESS, '')

  log('Querying private balance...')
  const balances = await getBalances(network, [railgunWallet.railgunWalletID])
  const tokenKey = `${tokenData.tokenAddress.toLowerCase()}_${tokenData.tokenSubID}`
  const balance = (balances[0][tokenKey] as bigint) || BigInt(0)

  const usdcBalance = Number(balance) / Number(1e6)
  log(`Private USDC balance: ${usdcBalance.toLocaleString()} USDC`, 'success')
  log(`Raw balance: ${balance.toString()} wei`)

  if (balance === BigInt(0)) {
    throw new Error('No USDC balance found in private wallet')
  }

  const amountToUnshield = balance
  const usdcAmount = Number(amountToUnshield) / Number(1e6)
  log(`Amount to unshield: ${usdcAmount.toLocaleString()} USDC`, 'info')
  log('', 'info')

  return amountToUnshield
}

async function unshieldTransaction(amount: bigint): Promise<{ txHash: string; amount: bigint; from: string; to: string }> {
  logStep(3, 6, 'Prepare Unshield Transaction')

  const network = NetworkName.Sepolia
  const toPublicAddress = await signer.getAddress()
  const tokenData = getTokenData(TokenType.ERC20, USDC_ADDRESS, '')

  log(`From: 0zk address ${formatAddressFull(railgunWallet.railgunWalletID)}`)
  log(`To: Public address ${formatAddress(toPublicAddress)}`)
  log(`Amount: ${Number(amount) / Number(1e6)} USDC`)
  log(`Token: USDC (${USDC_ADDRESS})`)

  const outputs = [
    {
      toAddress: toPublicAddress.toLowerCase(),
      token: tokenData,
      amountString: amount.toString(),
    },
  ]

  log('', 'info')
  return { txHash: '', amount, from: railgunWallet.railgunWalletID, to: toPublicAddress }
}

async function generateProofAndSign(): Promise<{ txData: any; proofResult: any }> {
  logStep(4, 6, 'Generate ZK Proof & Sign')

  const network = NetworkName.Sepolia
  const tokenData = getTokenData(TokenType.ERC20, USDC_ADDRESS, '')
  const toPublicAddress = await signer.getAddress()

  log('Creating unshield transaction...')
  const txVersion = TXVersion.V2_Positive
  const showWalletAddress = toPublicAddress

  try {
    const txData = await createTransaction(
      network,
      railgunWallet.railgunWalletID,
      showWalletAddress,
      txVersion,
      [],
      [],
      (outputs: any[]) => outputs.map((o: any) => ({
        toAddress: o.toAddress,
        token: o.token,
        amountString: o.amountString,
      })),
      undefined,
      POIRequired.Yes,
      ProvingMode.Groth16,
    )

    log('Transaction created successfully', 'success')
    log(`Transaction version: ${txVersion}`)

    log('', 'info')
    log('Generating ZK proof (Groth16)...')
    const proveStartTime = Date.now()

    const proofResult = await prove(txData)

    const proveDuration = ((Date.now() - proveStartTime) / 1000).toFixed(2)
    log(`ZK proof generated in ${proveDuration}s`, 'success')

    return { txData, proofResult }
  } catch (error) {
    throw new Error(`Failed to create transaction or generate proof: ${error}`)
  }
}

async function submitTransaction(): Promise<{ txHash: string }> {
  logStep(5, 6, 'Sign & Submit Transaction')

  const network = NetworkName.Sepolia
  const toPublicAddress = await signer.getAddress()
  const tokenData = getTokenData(TokenType.ERC20, USDC_ADDRESS, '')

  const balances = await getBalances(network, [railgunWallet.railgunWalletID])
  const tokenKey = `${tokenData.tokenAddress.toLowerCase()}_${tokenData.tokenSubID}`
  const balance = (balances[0][tokenKey] as bigint) || BigInt(0)

  const outputs = [{
    toAddress: toPublicAddress.toLowerCase(),
    token: tokenData,
    amountString: balance.toString(),
  }]

  const txVersion = TXVersion.V2_Positive

  const txData = await createTransaction(
    network,
    railgunWallet.railgunWalletID,
    toPublicAddress,
    txVersion,
    [],
    [],
    outputs,
    undefined,
    POIRequired.Yes,
    ProvingMode.Groth16,
  )

  log('Estimating gas...')
  const gasEstimate = await provider.estimateGas({
    to: txData.transactions[0].to,
    data: txData.transactions[0].data,
  })
  log(`Estimated gas: ${gasEstimate.toString()}`)

  const proofResult = await prove(txData)

  log('Signing transaction...')
  const signedTx = await signer.signTransaction(txData.transactions[0])
  log('Transaction signed', 'success')

  log('Submitting transaction to Sepolia...')
  const txHash = await publishTransaction(
    network,
    railgunWallet.railgunWalletID,
    txVersion,
    txData,
    proofResult,
    [signedTx],
    undefined,
    POIRequired.Yes,
    ProvingMode.Groth16,
  )

  log(`Transaction submitted: ${formatAddress(txHash, 10)}`, 'success')
  log(`Full tx hash: ${txHash}`)

  log('', 'info')
  return { txHash }
}

async function waitForConfirmation(txHash: string): Promise<void> {
  logStep(6, 6, 'Wait for Transaction Confirmation')

  log(`Waiting for confirmation of tx: ${formatAddress(txHash, 10)}...`)

  try {
    const receipt = await provider.waitForTransaction(txHash, 2, 120000)
    
    if (receipt && receipt.status === 1) {
      log('Transaction confirmed successfully!', 'success')
      log(`Block number: ${receipt.blockNumber}`)
      log(`Gas used: ${receipt.gasUsed.toString()}`)
      
      const block = await provider.getBlock(receipt.blockNumber)
      log(`Timestamp: ${block ? new Date(Number(block.timestamp) * 1000).toISOString() : 'N/A'}`)
    } else {
      throw new Error('Transaction failed or was reverted')
    }
  } catch (error) {
    throw new Error(`Failed to confirm transaction: ${error}`)
  }

  log('', 'info')
}

function displaySummary(txHash: string, amount: bigint, from: string, to: string): void {
  logSeparator()
  console.log(`${colors.bold}${colors.success}╔══════════════════════════════════════════════════════════════╗${colors.reset}`)
  console.log(`${colors.bold}${colors.success}║${colors.reset}           RAILGUN UNSHIELDING COMPLETE               ${colors.bold}${colors.success}║${colors.reset}`)
  console.log(`${colors.bold}${colors.success}╚══════════════════════════════════════════════════════════════╝${colors.reset}`)
  logSeparator()
  
  console.log(`\n${colors.bold}OPERATION:${colors.reset}  Private → Public (Unshield)`)
  console.log(`\n${colors.bold}TOKEN:${colors.reset}        USDC (USD Coin)`)
  console.log(`${colors.bold}NETWORK:${colors.reset}      Ethereum Sepolia Testnet`)
  console.log(`${colors.bold}PROVING MODE:${colors.reset}  Groth16 (ZK Proof)`)
  console.log(`\n${colors.bold}AMOUNT UNSHIELDED:${colors.reset}`)
  console.log(`  ${colors.success}${Number(amount) / Number(1e6)} USDC${colors.reset}`)
  console.log(`  (${amount.toString()} wei)`)
  console.log(`\n${colors.bold}FROM (0zk private):${colors.reset}`)
  console.log(`  ${from}`)
  console.log(`\n${colors.bold}TO (Public 0x):${colors.reset}`)
  console.log(`  ${to}`)
  console.log(`\n${colors.bold}TRANSACTION:${colors.reset}`)
  console.log(`  Hash: ${txHash}`)
  console.log(`  Etherscan: https://sepolia.etherscan.io/tx/${txHash}`)
  
  console.log(`\n${colors.bold}${colors.success}✓ Privacy lifecycle completed:${colors.reset}`)
  console.log(`  ${colors.cyan}→ Public → Private (Shield)${colors.reset}`)
  console.log(`  ${colors.cyan}→ Private → Private (Self-transfer)${colors.reset}`)
  console.log(`  ${colors.success}→ Private → Public (Unshield)${colors.reset}`)
  console.log()
  logSeparator()
}

async function main() {
  try {
    console.log()
    logSeparator()
    console.log(`${colors.bold}${colors.magenta}      RAILGUN PRIVATE → PUBLIC UNSHIELDING DEMO${colors.reset}`)
    console.log(`${colors.bold}${colors.magenta}           Ethereum Sepolia Testnet${colors.reset}`)
    logSeparator()
    console.log()

    await initialize()

    const amount = await checkBalance()

    const { from, to } = await unshieldTransaction(amount)

    await generateProofAndSign()

    const { txHash } = await submitTransaction()

    await waitForConfirmation(txHash)

    displaySummary(txHash, amount, from, to)

    log('Demo completed successfully!', 'success')

  } catch (error) {
    log(`Error: ${error}`, 'error')
    logSeparator()
    process.exit(1)
  }
}

main()
