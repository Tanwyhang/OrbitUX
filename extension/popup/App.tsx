// Popup App Component - Main UI for Orbit Wallet Extension
import React, { useState, useEffect } from 'react'
import IntroScreen from './IntroScreen'
import WalletSetupScreen from './WalletSetupScreen'

// Types
interface LockState {
  locked: boolean
  lastActivity: number
}

interface Account {
  address: string
  railgunAddress?: string
  index: number
  label: string
}

interface Settings {
  selectedNetwork: string
  autoLockMinutes: number
}

// Components
const LockScreen: React.FC<{
  onUnlock: (password: string) => void
  error?: string
}> = ({ onUnlock, error }) => {
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.trim()) {
      onUnlock(password)
    }
  }

  return (
    <div style={styles.lockContainer}>
      <div style={styles.lockContent}>
        <div style={styles.logo}>
          <img src="/orbit.png" alt="Orbit" width={80} height={80} style={{ objectFit: 'contain' }} />
        </div>
        <h2 style={styles.title}>Orbit Wallet</h2>
        <p style={styles.subtitle}>Enter your password to unlock</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoFocus
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.button}>
            Unlock
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>Powered by RAILGUN</p>
        </div>
      </div>
    </div>
  )
}

const MainScreen: React.FC<{
  accounts: Account[]
  settings: Settings
  onLock: () => void
}> = ({ accounts, settings, onLock }) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'activity' | 'send'>('assets')
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(accounts[0] || null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleDisconnect = () => {
    onLock()
  }

  const handleBuy = () => {
    // Open the onramp trigger page which will open the zkp2p side panel and close itself
    chrome.tabs.create({ url: 'http://localhost:3000/onramp' })
  }

  const handleSwap = () => {
    // Open the web app's swap page
    chrome.tabs.create({ url: 'http://localhost:3000/swap' })
  }

  const handleSend = () => {
    // Open the web app's send page
    chrome.tabs.create({ url: 'http://localhost:3000/zkWormhole' })
  }

  const handleReceive = () => {
    setShowReceiveModal(true)
  }

  const copyAddress = () => {
    if (selectedAccount) {
      navigator.clipboard.writeText(selectedAccount.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={styles.mainContainer}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerTitle}>Orbit</span>
          <select
            value={settings.selectedNetwork}
            style={styles.networkSelect}
            onChange={(e) => {
              chrome.runtime.sendMessage({
                type: 'SWITCH_NETWORK',
                network: e.target.value,
              })
            }}
          >
            <option value="ethereum">Ethereum</option>
            <option value="sepolia">Sepolia</option>
            <option value="polygon">Polygon</option>
          </select>
        </div>
        <button onClick={handleDisconnect} style={styles.lockButton}>
          🔒
        </button>
      </div>

      {/* Account Info */}
      {selectedAccount && (
        <div style={styles.accountCard}>
          <p style={styles.accountLabel}>{selectedAccount.label}</p>
          <p style={styles.accountAddress}>
            {selectedAccount.address.slice(0, 6)}...{selectedAccount.address.slice(-4)}
          </p>
          <p style={styles.balance}>0.00 ETH</p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.actionButtonsContainer}>
        <button style={styles.actionButton} onClick={handleBuy}>Buy</button>
        <button style={styles.actionButton} onClick={handleSend}>Send</button>
        <button style={styles.actionButton} onClick={handleSwap}>Swap</button>
        <button style={styles.actionButton} onClick={handleReceive}>Receive</button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('assets')}
          style={{
            ...styles.tab,
            ...(activeTab === 'assets' ? styles.tabActive : {}),
          }}
        >
          Assets
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          style={{
            ...styles.tab,
            ...(activeTab === 'activity' ? styles.tabActive : {}),
          }}
        >
          Activity
        </button>
        <button
          onClick={() => setActiveTab('send')}
          style={{
            ...styles.tab,
            ...(activeTab === 'send' ? styles.tabActive : {}),
          }}
        >
          Send
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {activeTab === 'assets' && (
          <div>
            <p style={styles.emptyState}>No tokens yet</p>
            <p style={styles.emptySubtext}>Connect to dApps or receive tokens</p>
          </div>
        )}
        {activeTab === 'activity' && (
          <div>
            <p style={styles.emptyState}>No recent activity</p>
          </div>
        )}
        {activeTab === 'send' && (
          <div>
            <p style={styles.emptyState}>Send feature coming soon</p>
          </div>
        )}
      </div>

      {/* Receive Modal */}
      {showReceiveModal && selectedAccount && (
        <div style={styles.modalOverlay} onClick={() => setShowReceiveModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Receive Funds</h3>
              <button
                style={styles.closeButton}
                onClick={() => setShowReceiveModal(false)}
              >
                ✕
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={styles.modalLabel}>Your Wallet Address</p>
              <div style={styles.addressBox}>
                <span style={styles.addressText}>{selectedAccount.address}</span>
                <button
                  style={styles.copyButton}
                  onClick={copyAddress}
                >
                  {copied ? '✓' : '📋'}
                </button>
              </div>
              <p style={styles.modalHint}>Send tokens to this address to add funds to your wallet</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true)
  const [lockState, setLockState] = useState<LockState>({ locked: true, lastActivity: 0 })
  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<Settings>({
    selectedNetwork: 'sepolia',
    autoLockMinutes: 10,
  })
  const [unlockError, setUnlockError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [showMainContent, setShowMainContent] = useState(false)
  const [walletExists, setWalletExists] = useState<boolean | null>(null)

  const handleIntroComplete = () => {
    setShowIntro(false)
    setShowMainContent(true)
  }

  // Load initial state
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_WALLET_STATE' }, (response) => {
      if (response?.success) {
        setLockState(response.lockState || { locked: true, lastActivity: 0 })
        setAccounts(response.accounts || [])
        setSettings(response.settings || settings)

        // Check if wallet exists
        const hasWallet = response.accounts && response.accounts.length > 0
        setWalletExists(hasWallet)
      }
      setLoading(false)
    })

    // Listen for state changes
    const listener = (message: any) => {
      if (message.type === 'LOCK_STATE_CHANGED') {
        setLockState(message.lockState)
      }
    }

    chrome.runtime.onMessage.addListener(listener)

    return () => {
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [])

  // Track user activity to prevent auto-lock
  useEffect(() => {
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart']

    const handleActivity = () => {
      chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' })
    }

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity)
    })

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [])

  // Handle wallet unlock
  const handleUnlock = async (password: string) => {
    chrome.runtime.sendMessage(
      {
        type: 'UNLOCK_WALLET',
        password,
      },
      (response) => {
        if (response?.success) {
          setLockState({ locked: false, lastActivity: Date.now() })
          setUnlockError(undefined)
        } else {
          setUnlockError('Incorrect password')
        }
      }
    )
  }

  // Handle wallet lock
  const handleLock = async () => {
    chrome.runtime.sendMessage({ type: 'LOCK_WALLET' }, () => {
      setLockState({ locked: true, lastActivity: Date.now() })
    })
  }

  // Show intro screen first
  if (showIntro) {
    return <IntroScreen onComplete={handleIntroComplete} />
  }

  // Show loading after intro
  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loading}>Loading Orbit Wallet...</p>
      </div>
    )
  }

  // Show main content after intro completes
  if (!showMainContent) {
    return null
  }

  // Show wallet setup screen if no wallet exists
  if (walletExists === false) {
    return <WalletSetupScreen onWalletCreated={() => setWalletExists(true)} onWalletImported={() => setWalletExists(true)} />
  }

  return (
    <>
      {lockState.locked ? (
        <LockScreen onUnlock={handleUnlock} error={unlockError} />
      ) : (
        <MainScreen accounts={accounts} settings={settings} onLock={handleLock} />
      )}
    </>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    color: '#ffffff',
  },
  lockContainer: {
    width: '100%',
    height: '100%',
    background: '#000000',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    color: '#ffffff',
  },
  lockContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '320px',
  },
  logo: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '8px',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '32px',
    textAlign: 'center' as const,
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 118, 168, 0.3)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'Doto, sans-serif',
  },
  error: {
    color: '#ff76a8',
    fontSize: '14px',
    margin: '0',
  },
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: '#ff76a8',
    color: '#000000',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'Doto, sans-serif',
  },
  footer: {
    marginTop: '32px',
  },
  footerText: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center' as const,
  },
  loading: {
    fontSize: '16px',
    color: '#ffffff',
    fontFamily: 'Doto, sans-serif',
  },
  mainContainer: {
    width: '100%',
    height: '100%',
    background: '#000000',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#ffffff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    fontFamily: 'Doto, sans-serif',
  },
  networkSelect: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'Doto, sans-serif',
  },
  lockButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  accountCard: {
    padding: '20px',
    margin: '16px 20px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 118, 168, 0.2)',
  },
  accountLabel: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '4px',
  },
  accountAddress: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '8px',
    fontFamily: 'Doto, sans-serif',
  },
  balance: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#ff76a8',
  },
  tabs: {
    display: 'flex',
    padding: '0 20px',
    gap: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  tab: {
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    fontFamily: 'Doto, sans-serif',
  },
  tabActive: {
    color: '#ffffff',
    borderBottomColor: '#ff76a8',
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto' as const,
  },
  emptyState: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center' as const,
    marginTop: '60px',
  },
  emptySubtext: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.3)',
    textAlign: 'center' as const,
    marginTop: '8px',
  },
  actionButtonsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  actionButton: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 118, 168, 0.3)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'Doto, sans-serif',
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
    maxWidth: '400px',
    width: '100%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: 0,
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  },
  modalBody: {
    padding: '20px',
  },
  modalLabel: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '12px',
  },
  addressBox: {
    display: 'flex',
    gap: '8px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '16px',
  },
  addressText: {
    flex: 1,
    fontSize: '12px',
    fontFamily: 'Doto, sans-serif',
    wordBreak: 'break-all' as const,
    color: '#ffffff',
  },
  copyButton: {
    background: 'rgba(255, 118, 168, 0.2)',
    border: '1px solid rgba(255, 118, 168, 0.3)',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '16px',
    flexShrink: 0,
  },
  modalHint: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center' as const,
    margin: 0,
  },
}

export default App
