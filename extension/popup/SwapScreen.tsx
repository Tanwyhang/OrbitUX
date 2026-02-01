// Swap Screen Component - Cross-chain swap functionality for Orbit Wallet Extension
// Duplicated from app/swap/page.tsx (CrossChainSwapContent)
import React, { useState, useEffect, useCallback } from 'react'
import { TokenETH, TokenUSDT, TokenEURC, NetworkSepolia, NetworkArbitrumSepolia, NetworkPolygonAmoy } from '@web3icons/react'

// ═══════════════════════════════════════════════════════════════
// TYPES (from lib/swap/types.ts and lib/swap/crossChainTypes.ts)
// ═══════════════════════════════════════════════════════════════

type TokenSymbol = 'ETH' | 'USDT' | 'EURC'
type ChainId = number
type PoolPair = 'ETH_USDT' | 'EURC_USDT' | 'ETH_EURC'

type CrossChainOperationType =
  | 'swap'              // Same-chain swap
  | 'transfer'          // Cross-chain transfer (no swap)
  | 'cross_chain_swap'  // Cross-chain swap (swap + transfer)

interface PoolToken {
  symbol: TokenSymbol
  address: `0x${string}`
  decimals: number
  name: string
  color: string
}

interface CrossChainPool {
  address: `0x${string}`
  pair: PoolPair
  token0: PoolToken
  token1: PoolToken
  supportedChains: ChainId[]
  isCrossChainEnabled: boolean
}

interface CrossChainQuote {
  type: CrossChainOperationType
  tokenIn: PoolToken
  tokenOut: PoolToken
  sourceChainId: ChainId
  destChainId: ChainId
  amountIn: bigint
  amountOut: bigint
  minAmountOut: bigint
  priceImpact: number
  feeAmount: bigint
  feeBps: number
  pool: CrossChainPool
}

interface Account {
  address: string
  railgunAddress?: string
  index: number
  label: string
}

interface SwapScreenProps {
  account: Account | null
  onBack?: () => void
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION (from lib/swap/crossChainConfig.ts)
// ═══════════════════════════════════════════════════════════════

const CHAIN_IDS = {
  SEPOLIA: 11155111,
  ARBITRUM_SEPOLIA: 421614,
  POLYGON_AMOY: 80002,
} as const

// ═══════════════════════════════════════════════════════════════
// ICON MAPPING
// ═══════════════════════════════════════════════════════════════

const TOKEN_ICONS: Record<TokenSymbol, React.ComponentType<any>> = {
  ETH: TokenETH,
  USDT: TokenUSDT,
  EURC: TokenEURC,
}

const CHAIN_ICONS: Record<number, React.ComponentType<any>> = {
  [CHAIN_IDS.SEPOLIA]: NetworkSepolia,
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: NetworkArbitrumSepolia,
  [CHAIN_IDS.POLYGON_AMOY]: NetworkPolygonAmoy,
}

const CHAIN_NAMES: Record<number, string> = {
  [CHAIN_IDS.SEPOLIA]: 'Sepolia',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: 'Arbitrum Sepolia',
  [CHAIN_IDS.POLYGON_AMOY]: 'Polygon Amoy',
}

const SUPPORTED_DESTINATION_CHAINS: ChainId[] = [
  CHAIN_IDS.ARBITRUM_SEPOLIA,
  CHAIN_IDS.POLYGON_AMOY,
]

const CROSS_CHAIN_TOKENS: Record<TokenSymbol, PoolToken> = {
  ETH: {
    symbol: 'ETH',
    address: '0x715f70ef11A65b4c8A7CCAa32E8aAaeE5011F15e',
    decimals: 18,
    name: 'Ethereum',
    color: '#3B82F6',
  },
  USDT: {
    symbol: 'USDT',
    address: '0xa3750d39Fa8c377a7FB87FD1F2Be4321722E2c58',
    decimals: 18,
    name: 'Tether USD',
    color: '#10B981',
  },
  EURC: {
    symbol: 'EURC',
    address: '0x326c5d56646A513151c75DFa5923eF6875dE53d5',
    decimals: 18,
    name: 'Euro Coin',
    color: '#60A5FA',
  },
}

const CROSS_CHAIN_POOLS: Record<PoolPair, CrossChainPool> = {
  ETH_USDT: {
    address: '0x8A691ba5F5385916522917F9064044E994BD2b3e',
    pair: 'ETH_USDT',
    token0: CROSS_CHAIN_TOKENS.ETH,
    token1: CROSS_CHAIN_TOKENS.USDT,
    supportedChains: [CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.POLYGON_AMOY],
    isCrossChainEnabled: true,
  },
  EURC_USDT: {
    address: '0xbe48c809Be034B5154dDA847774d6aF45602cB30',
    pair: 'EURC_USDT',
    token0: CROSS_CHAIN_TOKENS.EURC,
    token1: CROSS_CHAIN_TOKENS.USDT,
    supportedChains: [CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.POLYGON_AMOY],
    isCrossChainEnabled: true,
  },
  ETH_EURC: {
    address: '0x04eBd4A555beF227E9F3AA4e85cebd58Db20e0b8',
    pair: 'ETH_EURC',
    token0: CROSS_CHAIN_TOKENS.ETH,
    token1: CROSS_CHAIN_TOKENS.EURC,
    supportedChains: [CHAIN_IDS.ARBITRUM_SEPOLIA, CHAIN_IDS.POLYGON_AMOY],
    isCrossChainEnabled: true,
  },
}

const CROSS_CHAIN_FEES = {
  SWAP_FEE_BPS: 30,
  CROSS_CHAIN_TRANSFER_FEE_BPS: 10,
  CROSS_CHAIN_SWAP_FEE_BPS: 40,
}

const TOKEN_LIST = Object.values(CROSS_CHAIN_TOKENS)

const SOURCE_CHAIN_OPTIONS = [
  { id: CHAIN_IDS.SEPOLIA, name: CHAIN_NAMES[CHAIN_IDS.SEPOLIA] },
  ...SUPPORTED_DESTINATION_CHAINS.map((id) => ({
    id,
    name: CHAIN_NAMES[id] || `Chain ${id}`,
  })),
]

const DEST_CHAIN_OPTIONS = [
  { id: CHAIN_IDS.SEPOLIA, name: CHAIN_NAMES[CHAIN_IDS.SEPOLIA] },
  ...SUPPORTED_DESTINATION_CHAINS.map((id) => ({
    id,
    name: CHAIN_NAMES[id] || `Chain ${id}`,
  })),
]

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (from lib/swap/index.ts)
// ═══════════════════════════════════════════════════════════════

function formatTokenAmount(amount: bigint, decimals: number, maxDecimals: number = 6): string {
  if (amount === 0n) return '0'
  const divisor = BigInt(10 ** decimals)
  const whole = amount / divisor
  const fraction = amount % divisor

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionStr = fraction.toString().padStart(decimals, '0')
  const trimmedFraction = fractionStr
    .slice(0, maxDecimals)
    .replace(/0+$/, '')

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString()
}

function parseAmount(amount: string, decimals: number): bigint {
  if (!amount || amount === '' || amount === '.') return BigInt(0)
  const [integerPart, fractionalPart = ''] = amount.split('.')
  const paddedFractional = fractionalPart
    .padEnd(decimals, '0')
    .slice(0, decimals)
  return BigInt(integerPart + paddedFractional)
}

function getPool(tokenA: TokenSymbol, tokenB: TokenSymbol): CrossChainPool | null {
  const pairKey = `${tokenA}_${tokenB}` as PoolPair
  const reversePairKey = `${tokenB}_${tokenA}` as PoolPair

  if (CROSS_CHAIN_POOLS[pairKey]) {
    return CROSS_CHAIN_POOLS[pairKey]
  }
  if (CROSS_CHAIN_POOLS[reversePairKey]) {
    return CROSS_CHAIN_POOLS[reversePairKey]
  }

  return null
}

// ═══════════════════════════════════════════════════════════════
// SWAP SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════════

const SwapScreen: React.FC<SwapScreenProps> = ({ account, onBack }) => {
  // Token selection
  const [fromToken, setFromToken] = useState<PoolToken>(CROSS_CHAIN_TOKENS.ETH)
  const [toToken, setToToken] = useState<PoolToken>(CROSS_CHAIN_TOKENS.USDT)

  // Source and destination chains
  const [fromChainId, setFromChainId] = useState<ChainId>(CHAIN_IDS.SEPOLIA)
  const [destChainId, setDestChainId] = useState<ChainId>(CHAIN_IDS.ARBITRUM_SEPOLIA)

  // Amount input
  const [fromAmount, setFromAmount] = useState('')

  // Quote state
  const [quote, setQuote] = useState<CrossChainQuote | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Slippage settings
  const [slippage, setSlippage] = useState(0.5)
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)

  // Dropdown visibility
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false)
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false)
  const [showFromChainDropdown, setShowFromChainDropdown] = useState(false)
  const [showToChainDropdown, setShowToChainDropdown] = useState(false)

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false)
  const [progress, setProgress] = useState<{
    step: string
    message: string
    sourceTxHash?: string
    destTxHash?: string
    error?: Error
  }>({ step: 'idle', message: '' })

  // Balances
  const [balances, setBalances] = useState<Record<TokenSymbol, bigint>>({
    ETH: 0n,
    USDT: 0n,
    EURC: 0n,
  })

  // Fetch balances on mount and when account changes
  useEffect(() => {
    if (account?.address) {
      fetchBalances()
    }
  }, [account])

  const fetchBalances = () => {
    if (!account?.address) return

    const tokens: TokenSymbol[] = ['ETH', 'USDT', 'EURC']
    const newBalances: Record<TokenSymbol, bigint> = { ETH: 0n, USDT: 0n, EURC: 0n }

    let completed = 0
    tokens.forEach((token) => {
      chrome.runtime.sendMessage(
        {
          type: 'GET_BALANCE',
          data: {
            address: account.address,
            token,
          },
        },
        (response) => {
          if (response?.success) {
            newBalances[token] = BigInt(response.balance || '0')
          }
          completed++
          if (completed === tokens.length) {
            setBalances(newBalances)
          }
        }
      )
    })
  }

  // Fetch quote when inputs change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!fromAmount || fromAmount === '' || parseFloat(fromAmount) === 0) {
        setQuote(null)
        return
      }

      setIsQuoteLoading(true)
      setQuoteError(null)

      try {
        const amountIn = parseAmount(fromAmount, fromToken.decimals)

        // Find the pool for this token pair
        const pool = getPool(fromToken.symbol, toToken.symbol)
        if (!pool) {
          setQuoteError('No pool found for this token pair')
          setQuote(null)
          setIsQuoteLoading(false)
          return
        }

        // Determine operation type
        const isCrossChain = fromChainId !== destChainId
        const isSameToken = fromToken.symbol === toToken.symbol

        let operationType: CrossChainOperationType
        let feeBps: number
        let amountOut: bigint
        let priceImpact = 0

        if (isCrossChain) {
          if (isSameToken) {
            operationType = 'transfer'
            feeBps = CROSS_CHAIN_FEES.CROSS_CHAIN_TRANSFER_FEE_BPS
            // For transfer, amount out is amount minus fee
            const feeAmount = (amountIn * BigInt(feeBps)) / BigInt(10000)
            amountOut = amountIn - feeAmount
          } else {
            operationType = 'cross_chain_swap'
            feeBps = CROSS_CHAIN_FEES.CROSS_CHAIN_SWAP_FEE_BPS
            // For cross-chain swap, we'd need to query the contract
            // For now, estimate with a simple calculation
            const feeAmount = (amountIn * BigInt(feeBps)) / BigInt(10000)
            amountOut = amountIn - feeAmount
            priceImpact = 0.1 // Placeholder
          }
        } else {
          operationType = 'swap'
          feeBps = CROSS_CHAIN_FEES.SWAP_FEE_BPS
          // For same-chain swap, calculate using pool reserves
          // Placeholder calculation
          const feeAmount = (amountIn * BigInt(feeBps)) / BigInt(10000)
          amountOut = (amountIn * 99n) / 100n // Rough estimate
          priceImpact = 0.05
        }

        // Calculate min amount out based on slippage
        const slippageBps = Math.floor(slippage * 100)
        const minAmountOut = (amountOut * BigInt(10000 - slippageBps)) / BigInt(10000)

        const newQuote: CrossChainQuote = {
          type: operationType,
          tokenIn: fromToken,
          tokenOut: toToken,
          sourceChainId: fromChainId,
          destChainId,
          amountIn,
          amountOut,
          minAmountOut,
          priceImpact,
          feeAmount: amountIn - amountOut,
          feeBps,
          pool,
        }

        setQuote(newQuote)
      } catch (err) {
        setQuoteError(err instanceof Error ? err.message : 'Failed to get quote')
        setQuote(null)
      } finally {
        setIsQuoteLoading(false)
      }
    }

    const debounceTimeout = setTimeout(fetchQuote, 300)
    return () => clearTimeout(debounceTimeout)
  }, [fromAmount, fromToken, toToken, fromChainId, destChainId, slippage])

  // Get formatted output amount
  const outputAmount = quote
    ? formatTokenAmount(quote.amountOut, toToken.decimals, 6)
    : ''

  // Get formatted balance
  const fromBalance = formatTokenAmount(
    balances[fromToken.symbol],
    fromToken.decimals,
    4
  )
  const toBalance = formatTokenAmount(
    balances[toToken.symbol],
    toToken.decimals,
    4
  )

  // Check if user has sufficient balance
  const insufficientBalance = (() => {
    if (!fromAmount || fromAmount === '') return false
    const inputParsed = parseFloat(fromAmount)
    const balanceParsed = parseFloat(fromBalance)
    return inputParsed > balanceParsed
  })()

  // Is cross-chain operation
  const isCrossChain = fromChainId !== destChainId

  // Swap direction - swap tokens, chains, and amount
  const handleSwapDirection = () => {
    const tempToken = fromToken
    setFromToken(toToken)
    setToToken(tempToken)

    const tempChain = fromChainId
    setFromChainId(destChainId)
    setDestChainId(tempChain)

    setFromAmount(outputAmount)
  }

  // Set max amount
  const handleMaxClick = () => {
    setFromAmount(fromBalance)
  }

  // Execute swap/transfer
  const handleSwap = async () => {
    if (!quote || !account) return

    setIsExecuting(true)
    setProgress({ step: 'executing', message: 'Executing transaction...' })

    try {
      chrome.runtime.sendMessage(
        {
          type: 'EXECUTE_SWAP',
          data: {
            fromToken: fromToken.symbol,
            toToken: toToken.symbol,
            amount: fromAmount,
            destChainId,
            fromChainId,
            quote,
            address: account.address,
          },
        },
        (response) => {
          setIsExecuting(false)

          if (response?.success) {
            setProgress({
              step: 'complete',
              message: 'Transaction successful!',
              sourceTxHash: response.txHash,
            })
            fetchBalances()
            setFromAmount('')
            setQuote(null)
          } else {
            setProgress({
              step: 'error',
              message: 'Transaction failed',
              error: new Error(response?.error || 'Unknown error'),
            })
          }
        }
      )
    } catch (err) {
      setIsExecuting(false)
      setProgress({
        step: 'error',
        message: 'Transaction failed',
        error: err instanceof Error ? err : new Error('Unknown error'),
      })
    }
  }

  // Get button state
  const getButtonState = (): { text: string; disabled: boolean } => {
    if (!account) {
      return { text: 'No Account', disabled: true }
    }
    if (isExecuting) {
      return { text: progress.message, disabled: true }
    }
    if (!fromAmount || fromAmount === '' || parseFloat(fromAmount) === 0) {
      return { text: 'Enter Amount', disabled: true }
    }
    if (insufficientBalance) {
      return { text: `Insufficient ${fromToken.symbol}`, disabled: true }
    }
    if (isQuoteLoading) {
      return { text: 'Fetching Quote...', disabled: true }
    }
    if (quoteError) {
      return { text: 'No Route Available', disabled: true }
    }
    if (!quote) {
      return { text: 'Enter Amount', disabled: true }
    }

    // Dynamic button text based on operation type
    if (quote.type === 'transfer') {
      return { text: `Transfer to ${CHAIN_NAMES[destChainId]}`, disabled: false }
    }
    if (quote.type === 'cross_chain_swap') {
      return { text: `Swap to ${CHAIN_NAMES[destChainId]}`, disabled: false }
    }
    return { text: isCrossChain ? `Swap to ${CHAIN_NAMES[destChainId]}` : 'Swap', disabled: false }
  }

  const buttonState = getButtonState()

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFromTokenDropdown(false)
      setShowToTokenDropdown(false)
      setShowFromChainDropdown(false)
      setShowToChainDropdown(false)
    }

    if (showFromTokenDropdown || showToTokenDropdown || showFromChainDropdown || showToChainDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showFromTokenDropdown, showToTokenDropdown, showFromChainDropdown, showToChainDropdown])

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={styles.backButton}>
            ←
          </button>
        )}
        <h2 style={styles.title}>Cross-Chain Swap</h2>
        <button
          onClick={() => setShowSlippageSettings(!showSlippageSettings)}
          style={styles.settingsButton}
        >
          ⚙️
        </button>
      </div>

      {/* Account Info */}
      {account && (
        <div style={styles.accountCard}>
          <p style={styles.accountLabel}>Connected</p>
          <p style={styles.accountAddress}>
            {account.address.slice(0, 6)}...{account.address.slice(-4)}
          </p>
        </div>
      )}

      {/* Slippage Settings */}
      {showSlippageSettings && (
        <div style={styles.slippageCard}>
          <p style={styles.slippageLabel}>Slippage Tolerance</p>
          <div style={styles.slippageButtons}>
            <button
              onClick={() => setSlippage(0.1)}
              style={{
                ...styles.slippageButton,
                ...(slippage === 0.1 ? styles.slippageButtonActive : {}),
              }}
            >
              0.1%
            </button>
            <button
              onClick={() => setSlippage(0.5)}
              style={{
                ...styles.slippageButton,
                ...(slippage === 0.5 ? styles.slippageButtonActive : {}),
              }}
            >
              0.5%
            </button>
            <button
              onClick={() => setSlippage(1.0)}
              style={{
                ...styles.slippageButton,
                ...(slippage === 1.0 ? styles.slippageButtonActive : {}),
              }}
            >
              1.0%
            </button>
          </div>
        </div>
      )}

      {/* From Token */}
      <div style={styles.section}>
        <div style={styles.tokenHeader}>
          <label style={styles.label}>From</label>
          <span style={styles.balanceLabel}>
            Balance: {fromBalance} {fromToken.symbol}
          </span>
        </div>
        <div style={styles.tokenCard}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowFromTokenDropdown(!showFromTokenDropdown)
              setShowToTokenDropdown(false)
              setShowFromChainDropdown(false)
              setShowToChainDropdown(false)
            }}
            style={styles.tokenIconButton}
          >
            {React.createElement(TOKEN_ICONS[fromToken.symbol], {
              variant: 'branded',
              style: { width: 40, height: 40 },
            })}
          </button>
          <div style={styles.amountContainer}>
            <input
              type="number"
              placeholder="0.00"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              style={{
                ...styles.amountInput,
                ...(insufficientBalance ? styles.amountInputError : {}),
              }}
            />
            <button onClick={handleMaxClick} style={styles.maxButton}>
              MAX
            </button>
          </div>
          <div style={styles.tokenRightButtons}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowFromTokenDropdown(!showFromTokenDropdown)
                setShowToTokenDropdown(false)
                setShowFromChainDropdown(false)
                setShowToChainDropdown(false)
              }}
              style={styles.tokenSymbolButton}
            >
              {fromToken.symbol}
            </button>
            <div style={styles.relative}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowFromChainDropdown(!showFromChainDropdown)
                  setShowToChainDropdown(false)
                  setShowFromTokenDropdown(false)
                  setShowToTokenDropdown(false)
                }}
                style={styles.chainButton}
              >
                {React.createElement(CHAIN_ICONS[fromChainId], {
                  variant: 'branded',
                  style: { width: 20, height: 20 },
                })}
              </button>
              {showFromChainDropdown && (
                <div style={styles.dropdownMenu}>
                  {SOURCE_CHAIN_OPTIONS.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFromChainId(chain.id)
                        setShowFromChainDropdown(false)
                      }}
                      style={{
                        ...styles.dropdownItem,
                        ...(fromChainId === chain.id ? styles.dropdownItemActive : {}),
                      }}
                    >
                      {React.createElement(CHAIN_ICONS[chain.id], {
                        variant: 'branded',
                        style: { width: 24, height: 24 },
                      })}
                      <span style={{ marginLeft: 8 }}>{chain.name}</span>
                      {fromChainId === chain.id && <span style={styles.checkmark}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* From Token Dropdown */}
        {showFromTokenDropdown && (
          <div style={styles.tokenDropdown}>
            {TOKEN_LIST.filter(
              (t) => t.symbol !== toToken.symbol
            ).map((token) => (
              <button
                key={token.symbol}
                onClick={(e) => {
                  e.stopPropagation()
                  setFromToken(token)
                  setShowFromTokenDropdown(false)
                  fetchBalances()
                }}
                style={styles.tokenDropdownItem}
              >
                {React.createElement(TOKEN_ICONS[token.symbol], {
                  variant: 'branded',
                  style: { width: 32, height: 32 },
                })}
                <div>
                  <div style={styles.tokenDropdownSymbol}>{token.symbol}</div>
                  <div style={styles.tokenDropdownName}>{token.name}</div>
                </div>
                <div style={styles.tokenDropdownBalance}>
                  {formatTokenAmount(balances[token.symbol], token.decimals, 4)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Swap Direction Button */}
      <div style={styles.swapDirectionContainer}>
        <button onClick={handleSwapDirection} style={styles.swapDirectionButton}>
          ⇅
        </button>
      </div>

      {/* To Token */}
      <div style={styles.section}>
        <div style={styles.tokenHeader}>
          <label style={styles.label}>To</label>
          {!isCrossChain && (
            <span style={styles.balanceLabel}>
              Balance: {toBalance} {toToken.symbol}
            </span>
          )}
        </div>
        <div style={styles.tokenCard}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowToTokenDropdown(!showToTokenDropdown)
              setShowFromTokenDropdown(false)
              setShowFromChainDropdown(false)
              setShowToChainDropdown(false)
            }}
            style={styles.tokenIconButton}
          >
            {React.createElement(TOKEN_ICONS[toToken.symbol], {
              variant: 'branded',
              style: { width: 40, height: 40 },
            })}
          </button>
          <div style={styles.amountContainer}>
            {isQuoteLoading ? (
              <div style={styles.loadingAmount}>...</div>
            ) : (
              <div style={styles.outputAmount}>{outputAmount || '0.00'}</div>
            )}
          </div>
          <div style={styles.tokenRightButtons}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowToTokenDropdown(!showToTokenDropdown)
                setShowFromTokenDropdown(false)
                setShowFromChainDropdown(false)
                setShowToChainDropdown(false)
              }}
              style={styles.tokenSymbolButton}
            >
              {toToken.symbol}
            </button>
            <div style={styles.relative}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowToChainDropdown(!showToChainDropdown)
                  setShowFromChainDropdown(false)
                  setShowFromTokenDropdown(false)
                  setShowToTokenDropdown(false)
                }}
                style={styles.chainButton}
              >
                {React.createElement(CHAIN_ICONS[destChainId], {
                  variant: 'branded',
                  style: { width: 20, height: 20 },
                })}
              </button>
              {showToChainDropdown && (
                <div style={styles.dropdownMenu}>
                  {DEST_CHAIN_OPTIONS.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDestChainId(chain.id)
                        setShowToChainDropdown(false)
                      }}
                      style={{
                        ...styles.dropdownItem,
                        ...(destChainId === chain.id ? styles.dropdownItemActive : {}),
                      }}
                    >
                      {React.createElement(CHAIN_ICONS[chain.id], {
                        variant: 'branded',
                        style: { width: 24, height: 24 },
                      })}
                      <span style={{ marginLeft: 8 }}>{chain.name}</span>
                      {destChainId === chain.id && <span style={styles.checkmark}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* To Token Dropdown */}
        {showToTokenDropdown && (
          <div style={styles.tokenDropdown}>
            {TOKEN_LIST.filter(
              (t) => t.symbol !== fromToken.symbol
            ).map((token) => (
              <button
                key={token.symbol}
                onClick={(e) => {
                  e.stopPropagation()
                  setToToken(token)
                  setShowToTokenDropdown(false)
                  fetchBalances()
                }}
                style={styles.tokenDropdownItem}
              >
                {React.createElement(TOKEN_ICONS[token.symbol], {
                  variant: 'branded',
                  style: { width: 32, height: 32 },
                })}
                <div>
                  <div style={styles.tokenDropdownSymbol}>{token.symbol}</div>
                  <div style={styles.tokenDropdownName}>{token.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quote Details */}
      {quote && (
        <div style={styles.quoteCard}>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Route</span>
            <span style={styles.quoteValue}>
              {CHAIN_NAMES[fromChainId]} → {CHAIN_NAMES[destChainId]}
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Operation</span>
            <span style={styles.quoteValue}>
              {quote.type.replace('_', ' ')}
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Fee</span>
            <span style={styles.quoteValue}>
              {(quote.feeBps / 100).toFixed(2)}%
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Price Impact</span>
            <span
              style={{
                ...styles.quoteValue,
                ...(quote.priceImpact > 1 ? styles.warning : {}),
              }}
            >
              {quote.priceImpact.toFixed(2)}%
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Min. Received</span>
            <span style={styles.quoteValue}>
              {formatTokenAmount(quote.minAmountOut, toToken.decimals, 6)}{' '}
              {toToken.symbol}
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Slippage</span>
            <span
              style={{
                ...styles.quoteValue,
                ...(slippage > 1 ? styles.warning : {}),
              }}
            >
              {slippage}%
            </span>
          </div>
        </div>
      )}

      {/* Transaction Progress */}
      {isExecuting && (
        <div style={styles.progressCard}>
          <div style={styles.progressContent}>
            <div style={styles.spinner} />
            <span style={styles.progressText}>{progress.message}</span>
          </div>
        </div>
      )}

      {/* Success Message */}
      {progress.step === 'complete' && progress.sourceTxHash && (
        <div style={styles.successCard}>
          <div style={styles.successContent}>
            <span style={styles.successIcon}>✓</span>
            <span style={styles.successText}>Transaction successful</span>
          </div>
          <div style={styles.txHash}>
            {progress.sourceTxHash.slice(0, 10)}...{progress.sourceTxHash.slice(-8)}
          </div>
        </div>
      )}

      {/* Error Message */}
      {progress.step === 'error' && progress.error && (
        <div style={styles.errorCard}>
          <span style={styles.errorIcon}>⚠️</span>
          <span style={styles.errorText}>{progress.error.message}</span>
        </div>
      )}

      {/* Swap Button */}
      <div style={styles.buttonContainer}>
        <button
          onClick={handleSwap}
          disabled={buttonState.disabled}
          style={{
            ...styles.swapButton,
            ...(buttonState.disabled ? styles.swapButtonDisabled : styles.swapButtonEnabled),
          }}
        >
          {buttonState.text}
        </button>
      </div>
    </div>
  )
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    background: '#000000',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#ffffff',
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    width: '40px',
  },
  settingsButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: 0,
    fontFamily: 'Doto, sans-serif',
  },
  accountCard: {
    padding: '12px 16px',
    margin: '0 20px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 118, 168, 0.2)',
  },
  accountLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '2px',
  },
  accountAddress: {
    fontSize: '13px',
    fontWeight: 'bold',
    fontFamily: 'Doto, sans-serif',
    margin: 0,
  },
  slippageCard: {
    margin: '0 20px 12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  slippageLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '8px',
  },
  slippageButtons: {
    display: 'flex',
    gap: '6px',
  },
  slippageButton: {
    flex: 1,
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  slippageButtonActive: {
    background: '#ff76a8',
    borderColor: '#ff76a8',
    color: '#000000',
  },
  section: {
    margin: '0 20px 12px',
    position: 'relative' as const,
  },
  label: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '6px',
    display: 'block',
  },
  tokenHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  balanceLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  tokenCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  tokenIconButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenRightButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tokenSymbolButton: {
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  chainButton: {
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  relative: {
    position: 'relative' as const,
  },
  amountContainer: {
    flex: 1,
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 'bold',
    outline: 'none',
    fontFamily: 'Doto, sans-serif',
    width: '100%',
  },
  amountInputError: {
    color: '#ff76a8',
  },
  maxButton: {
    padding: '4px 8px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  loadingAmount: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.4)',
    animation: 'pulse 1s infinite',
  },
  outputAmount: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffffff',
  },
  tokenDropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    background: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    zIndex: 100,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  tokenDropdownItem: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textAlign: 'left' as const,
  },
  tokenDropdownSymbol: {
    fontSize: '14px',
    fontWeight: 'bold',
  },
  tokenDropdownName: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tokenDropdownBalance: {
    marginLeft: 'auto',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  swapDirectionContainer: {
    display: 'flex',
    justifyContent: 'center',
    margin: '-6px 0',
    position: 'relative' as const,
    zIndex: 10,
  },
  swapDirectionButton: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  dropdownMenu: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    zIndex: 100,
    minWidth: '180px',
  },
  dropdownItem: {
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  dropdownItemActive: {
    background: 'rgba(255, 118, 168, 0.1)',
  },
  checkmark: {
    color: '#ff76a8',
    fontSize: '12px',
  },
  quoteCard: {
    margin: '0 20px 12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '13px',
  },
  quoteRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  quoteLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  quoteValue: {
    fontWeight: 'bold',
  },
  warning: {
    color: '#ffd700',
  },
  progressCard: {
    margin: '0 20px 12px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  progressContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  spinner: {
    width: '18px',
    height: '18px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  progressText: {
    fontSize: '13px',
  },
  successCard: {
    margin: '0 20px 12px',
    padding: '12px',
    background: 'rgba(0, 255, 100, 0.1)',
    borderRadius: '10px',
    border: '1px solid rgba(0, 255, 100, 0.3)',
  },
  successContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  successIcon: {
    color: '#00ff64',
    fontSize: '14px',
  },
  successText: {
    fontSize: '13px',
    color: '#00ff64',
  },
  txHash: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
  },
  errorCard: {
    margin: '0 20px 12px',
    padding: '12px',
    background: 'rgba(255, 100, 100, 0.1)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 100, 100, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  errorIcon: {
    fontSize: '14px',
  },
  errorText: {
    fontSize: '13px',
    color: '#ff76a8',
  },
  buttonContainer: {
    marginTop: 'auto',
    padding: '16px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  swapButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'Doto, sans-serif',
  },
  swapButtonEnabled: {
    background: '#ff76a8',
    color: '#000000',
  },
  swapButtonDisabled: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.4)',
    cursor: 'not-allowed',
  },
}

export default SwapScreen
