// Swap Screen Component - Cross-chain swap functionality for Orbit Wallet Extension
import React, { useState, useEffect } from 'react'

// Types
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

// Token options (simplified for extension)
const TOKENS = [
  { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { symbol: 'EURC', name: 'Euro Coin', decimals: 6 },
]

// Chain options
const CHAINS = [
  { id: 'sepolia', name: 'Sepolia (Same Chain)' },
  { id: 'arbitrum-sepolia', name: 'Arbitrum Sepolia' },
  { id: 'polygon-amoy', name: 'Polygon Amoy' },
]

const SwapScreen: React.FC<SwapScreenProps> = ({ account, onBack }) => {
  const [fromToken, setFromToken] = useState(TOKENS[0])
  const [toToken, setToToken] = useState(TOKENS[1])
  const [destChain, setDestChain] = useState(CHAINS[0])
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [fromBalance, setFromBalance] = useState('0.00')
  const [toBalance, setToBalance] = useState('0.00')
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false)
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false)
  const [showChainDropdown, setShowChainDropdown] = useState(false)
  const [slippage, setSlippage] = useState(0.5)
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [quote, setQuote] = useState<any>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch balances on mount
  useEffect(() => {
    if (account?.address) {
      fetchBalances()
    }
  }, [account])

  // Fetch quote when inputs change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!fromAmount || parseFloat(fromAmount) === 0) {
        setQuote(null)
        setToAmount('')
        return
      }

      setIsQuoteLoading(true)
      setError(null)

      try {
        // Get quote from background script
        chrome.runtime.sendMessage(
          {
            type: 'GET_SWAP_QUOTE',
            data: {
              fromToken: fromToken.symbol,
              toToken: toToken.symbol,
              amount: fromAmount,
              destChain: destChain.id,
              slippage,
            },
          },
          (response) => {
            setIsQuoteLoading(false)
            if (response?.success) {
              setQuote(response.quote)
              setToAmount(response.quote.outputAmount)
            } else {
              setError(response?.error || 'Failed to get quote')
              setToAmount('')
            }
          }
        )
      } catch (err) {
        setIsQuoteLoading(false)
        setError('Failed to get quote')
        setToAmount('')
      }
    }

    const debounceTimeout = setTimeout(fetchQuote, 500)
    return () => clearTimeout(debounceTimeout)
  }, [fromAmount, fromToken, toToken, destChain, slippage])

  const fetchBalances = () => {
    if (!account?.address) return

    // Fetch from token balance
    chrome.runtime.sendMessage(
      {
        type: 'GET_BALANCE',
        data: {
          address: account.address,
          token: fromToken.symbol,
        },
      },
      (response) => {
        if (response?.success) {
          const balance = parseFloat(response.balance || '0').toFixed(4)
          setFromBalance(balance)
        }
      }
    )

    // Fetch to token balance
    chrome.runtime.sendMessage(
      {
        type: 'GET_BALANCE',
        data: {
          address: account.address,
          token: toToken.symbol,
        },
      },
      (response) => {
        if (response?.success) {
          const balance = parseFloat(response.balance || '0').toFixed(4)
          setToBalance(balance)
        }
      }
    )
  }

  const handleSwapDirection = () => {
    const tempToken = fromToken
    const tempAmount = fromAmount
    setFromToken(toToken)
    setToToken(tempToken)
    setFromAmount(toAmount)
    setToAmount(tempAmount)
  }

  const handleMaxClick = () => {
    setFromAmount(fromBalance)
  }

  const handleSwap = async () => {
    if (!quote || !account) return

    setIsSwapping(true)
    setError(null)

    chrome.runtime.sendMessage(
      {
        type: 'EXECUTE_SWAP',
        data: {
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amount: fromAmount,
          destChain: destChain.id,
          quote,
        },
      },
      (response) => {
        setIsSwapping(false)
        if (response?.success) {
          setTxHash(response.txHash)
          setShowResult(true)
          setFromAmount('')
          setToAmount('')
          setQuote(null)
          fetchBalances()
        } else {
          setError(response?.error || 'Swap failed')
        }
      }
    )
  }

  const handleCloseResult = () => {
    setShowResult(false)
    setTxHash(null)
  }

  const insufficientBalance = () => {
    if (!fromAmount || fromAmount === '') return false
    return parseFloat(fromAmount) > parseFloat(fromBalance)
  }

  const canSwap = () => {
    return (
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      !insufficientBalance() &&
      toAmount &&
      !isQuoteLoading &&
      !isSwapping
    )
  }

  const isCrossChain = destChain.id !== 'sepolia'

  const getButtonText = () => {
    if (isSwapping) return 'Swapping...'
    if (!fromAmount || fromAmount === '') return 'Enter Amount'
    if (insufficientBalance()) return `Insufficient ${fromToken.symbol}`
    if (isQuoteLoading) return 'Fetching Quote...'
    if (error && !quote) return 'No Route Available'
    if (quote?.type === 'transfer') return `Transfer to ${destChain.name}`
    if (quote?.type === 'cross_chain_swap') return `Swap to ${destChain.name}`
    return 'Swap'
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={styles.backButton}>
            ←
          </button>
        )}
        <h2 style={styles.title}>Swap</h2>
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
          <p style={styles.accountLabel}>From</p>
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

      {/* Destination Chain Selector */}
      <div style={styles.section}>
        <label style={styles.label}>Destination Chain</label>
        <div style={styles.dropdownContainer}>
          <button
            onClick={() => setShowChainDropdown(!showChainDropdown)}
            style={styles.dropdownButton}
          >
            <span style={styles.dropdownText}>{destChain.name}</span>
            <span style={styles.dropdownArrow}>▼</span>
          </button>

          {showChainDropdown && (
            <div style={styles.dropdownMenu}>
              {CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setDestChain(chain)
                    setShowChainDropdown(false)
                  }}
                  style={{
                    ...styles.dropdownItem,
                    ...(destChain.id === chain.id ? styles.dropdownItemActive : {}),
                  }}
                >
                  {chain.name}
                  {destChain.id === chain.id && <span style={styles.checkmark}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* From Token */}
      <div style={styles.section}>
        <div style={styles.tokenHeader}>
          <label style={styles.label}>From (Sepolia)</label>
          <span style={styles.balanceLabel}>
            Balance: {fromBalance} {fromToken.symbol}
          </span>
        </div>
        <div style={styles.tokenCard}>
          <button
            onClick={() => {
              setShowFromTokenDropdown(!showFromTokenDropdown)
              setShowToTokenDropdown(false)
              setShowChainDropdown(false)
            }}
            style={styles.tokenButton}
          >
            <span style={styles.tokenSymbol}>{fromToken.symbol}</span>
            <span style={styles.tokenName}>{fromToken.name}</span>
            <span style={styles.dropdownArrow}>▼</span>
          </button>
          <div style={styles.amountContainer}>
            <input
              type="number"
              placeholder="0.00"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              style={{
                ...styles.amountInput,
                ...(insufficientBalance() ? styles.amountInputError : {}),
              }}
            />
            <button onClick={handleMaxClick} style={styles.maxButton}>
              MAX
            </button>
          </div>
        </div>

        {showFromTokenDropdown && (
          <div style={styles.tokenDropdown}>
            {TOKENS.filter((t) => t.symbol !== toToken.symbol).map((token) => (
              <button
                key={token.symbol}
                onClick={() => {
                  setFromToken(token)
                  setShowFromTokenDropdown(false)
                  fetchBalances()
                }}
                style={styles.tokenDropdownItem}
              >
                <div>
                  <div style={styles.tokenDropdownSymbol}>{token.symbol}</div>
                  <div style={styles.tokenDropdownName}>{token.name}</div>
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
          <label style={styles.label}>
            To ({isCrossChain ? destChain.name.split(' ')[0] : 'Sepolia'})
          </label>
          {!isCrossChain && (
            <span style={styles.balanceLabel}>
              Balance: {toBalance} {toToken.symbol}
            </span>
          )}
        </div>
        <div style={styles.tokenCard}>
          <button
            onClick={() => {
              setShowToTokenDropdown(!showToTokenDropdown)
              setShowFromTokenDropdown(false)
              setShowChainDropdown(false)
            }}
            style={styles.tokenButton}
          >
            <span style={styles.tokenSymbol}>{toToken.symbol}</span>
            <span style={styles.tokenName}>{toToken.name}</span>
            <span style={styles.dropdownArrow}>▼</span>
          </button>
          <div style={styles.amountContainer}>
            {isQuoteLoading ? (
              <div style={styles.loadingAmount}>...</div>
            ) : (
              <div style={styles.outputAmount}>{toAmount || '0.00'}</div>
            )}
          </div>
        </div>

        {showToTokenDropdown && (
          <div style={styles.tokenDropdown}>
            {TOKENS.filter((t) => t.symbol !== fromToken.symbol).map((token) => (
              <button
                key={token.symbol}
                onClick={() => {
                  setToToken(token)
                  setShowToTokenDropdown(false)
                  fetchBalances()
                }}
                style={styles.tokenDropdownItem}
              >
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
            <span style={styles.quoteLabel}>Operation</span>
            <span style={styles.quoteValue}>
              {quote.type?.replace('_', ' ') || 'Swap'}
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Fee</span>
            <span style={styles.quoteValue}>
              {((quote.feeBps || 0) / 100).toFixed(2)}%
            </span>
          </div>
          {quote.priceImpact !== undefined && (
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
          )}
          {quote.minAmountOut && (
            <div style={styles.quoteRow}>
              <span style={styles.quoteLabel}>Min. Received</span>
              <span style={styles.quoteValue}>
                {quote.minAmountOut} {toToken.symbol}
              </span>
            </div>
          )}
          {isCrossChain && (
            <div style={styles.quoteRow}>
              <span style={styles.quoteLabel}>Destination</span>
              <span style={styles.quoteValueHighlight}>{destChain.name}</span>
            </div>
          )}
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

      {/* Cross-chain indicator */}
      {isCrossChain && (
        <div style={styles.crossChainCard}>
          <div style={styles.crossChainContent}>
            <span style={styles.crossChainIcon}>⚡</span>
            <span style={styles.crossChainText}>Cross-Chain</span>
            <span style={styles.crossChainHint}>Tokens will be bridged</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !quote && (
        <div style={styles.errorCard}>
          <span style={styles.errorIcon}>⚠️</span>
          <span style={styles.errorText}>{error}</span>
        </div>
      )}

      {/* Swap Button */}
      <div style={styles.buttonContainer}>
        <button
          onClick={handleSwap}
          disabled={!canSwap()}
          style={{
            ...styles.swapButton,
            ...(canSwap() ? styles.swapButtonActive : {}),
          }}
        >
          {getButtonText()}
        </button>
      </div>

      {/* Result Modal */}
      {showResult && (
        <div style={styles.modalOverlay} onClick={handleCloseResult}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.successIcon}>✓</div>
            <h3 style={styles.modalTitle}>
              {isCrossChain ? 'Cross-chain swap initiated!' : 'Swap complete!'}
            </h3>
            {txHash && (
              <div style={styles.txHashContainer}>
                <p style={styles.txHashLabel}>Transaction Hash</p>
                <p style={styles.txHash}>
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </p>
              </div>
            )}
            {isCrossChain && (
              <p style={styles.modalHint}>
                Your tokens are being bridged. This may take a few minutes.
              </p>
            )}
            <button onClick={handleCloseResult} style={styles.modalButton}>
              Done
            </button>
          </div>
        </div>
      )}
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
    fontSize: '18px',
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
    flexDirection: 'column' as const,
    gap: '10px',
  },
  tokenButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tokenSymbol: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  tokenName: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    flex: 1,
    textAlign: 'left' as const,
  },
  dropdownArrow: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  amountContainer: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    outline: 'none',
    fontFamily: 'Doto, sans-serif',
    width: '100%',
  },
  amountInputError: {
    color: '#ff76a8',
  },
  maxButton: {
    padding: '6px 10px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  loadingAmount: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.4)',
    animation: 'pulse 1s infinite',
  },
  outputAmount: {
    fontSize: '24px',
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
  dropdownContainer: {
    position: 'relative' as const,
  },
  dropdownButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  dropdownText: {
    fontWeight: 'bold',
  },
  dropdownMenu: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    background: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    zIndex: 100,
  },
  dropdownItem: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '14px',
  },
  dropdownItemActive: {
    background: 'rgba(255, 118, 168, 0.1)',
  },
  checkmark: {
    color: '#ff76a8',
    fontSize: '14px',
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
  quoteValueHighlight: {
    fontWeight: 'bold',
    color: '#ff76a8',
  },
  warning: {
    color: '#ffd700',
  },
  crossChainCard: {
    margin: '0 20px 12px',
    padding: '12px',
    background: 'rgba(255, 118, 168, 0.05)',
    borderRadius: '10px',
    border: '1px solid rgba(255, 118, 168, 0.2)',
  },
  crossChainContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  crossChainIcon: {
    fontSize: '16px',
  },
  crossChainText: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ff76a8',
  },
  crossChainHint: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    marginLeft: 'auto',
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
    fontSize: '16px',
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
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'not-allowed',
    transition: 'all 0.2s',
    fontFamily: 'Doto, sans-serif',
  },
  swapButtonActive: {
    background: '#ff76a8',
    borderColor: '#ff76a8',
    color: '#000000',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalContent: {
    background: '#111111',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '32px',
    maxWidth: '360px',
    width: '100%',
    textAlign: 'center' as const,
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(0, 255, 100, 0.2)',
    border: '2px solid rgba(0, 255, 100, 0.5)',
    color: '#00ff64',
    fontSize: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0 0 16px 0',
    color: '#ffffff',
  },
  txHashContainer: {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
  },
  txHashLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    margin: '0 0 4px 0',
  },
  txHash: {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: '#ffffff',
    margin: 0,
    wordBreak: 'break-all' as const,
  },
  modalHint: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    margin: '0 0 20px 0',
  },
  modalButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    background: '#ff76a8',
    color: '#000000',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'Doto, sans-serif',
  },
}

export default SwapScreen
