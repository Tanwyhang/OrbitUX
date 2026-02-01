// Wallet Setup Screen - Create or Import Wallet
import React, { useState } from 'react'

interface WalletSetupScreenProps {
  onWalletCreated: (mnemonic: string) => void
  onWalletImported: () => void
}

const WalletSetupScreen: React.FC<WalletSetupScreenProps> = ({
  onWalletCreated,
  onWalletImported,
}) => {
  const [mode, setMode] = useState<'welcome' | 'create' | 'import'>('welcome')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleCreateWallet = async () => {
    setError('')

    // Validate password
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // Send create wallet request to background
      chrome.runtime.sendMessage(
        {
          type: 'CREATE_WALLET',
          data: { password },
        },
        (response) => {
          setLoading(false)
          if (response?.success) {
            setCreatedMnemonic(response.mnemonic)
            setShowMnemonic(true)
          } else {
            setError(response?.error || 'Failed to create wallet')
          }
        }
      )
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Failed to create wallet')
    }
  }

  const handleImportWallet = async () => {
    setError('')

    // Validate mnemonic
    const words = mnemonic.trim().split(/\s+/)
    if (words.length !== 12 && words.length !== 24) {
      setError('Mnemonic must be 12 or 24 words')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      chrome.runtime.sendMessage(
        {
          type: 'IMPORT_WALLET',
          data: { mnemonic, password },
        },
        (response) => {
          setLoading(false)
          if (response?.success) {
            onWalletImported()
          } else {
            setError(response?.error || 'Failed to import wallet')
          }
        }
      )
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Failed to import wallet')
    }
  }

  const handleConfirmMnemonic = () => {
    if (createdMnemonic) {
      onWalletCreated(createdMnemonic)
    }
  }

  if (showMnemonic && createdMnemonic) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <h2 style={styles.title}>Save Your Mnemonic</h2>
          <p style={styles.subtitle}>
            Write down these 12 words. This is the ONLY way to recover your wallet.
          </p>

          <div style={styles.mnemonicBox}>{createdMnemonic}</div>

          <div style={styles.warning}>
            ⚠️ <strong>Important:</strong> Never share your mnemonic with anyone!
          </div>

          <button
            onClick={handleConfirmMnemonic}
            style={styles.primaryButton}
          >
            I've Saved My Mnemonic
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'welcome') {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.logo}>
            <img src="/orbit-black.png" alt="Orbit" width={80} height={80} />
          </div>
          <h2 style={styles.title}>Welcome to Orbit</h2>
          <p style={styles.subtitle}>
            Privacy-first cryptocurrency wallet powered by RAILGUN
          </p>

          <button
            onClick={() => setMode('create')}
            style={styles.primaryButton}
          >
            Create New Wallet
          </button>

          <button
            onClick={() => setMode('import')}
            style={styles.secondaryButton}
          >
            Import Existing Wallet
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <button onClick={() => setMode('welcome')} style={styles.backButton}>
            ← Back
          </button>

          <h2 style={styles.title}>Create New Wallet</h2>
          <p style={styles.subtitle}>Set a password to encrypt your wallet</p>

          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={styles.input}
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button
              onClick={handleCreateWallet}
              disabled={loading}
              style={styles.primaryButton}
            >
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'import') {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <button onClick={() => setMode('welcome')} style={styles.backButton}>
            ← Back
          </button>

          <h2 style={styles.title}>Import Wallet</h2>
          <p style={styles.subtitle}>Enter your 12 or 24 word mnemonic phrase</p>

          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Mnemonic Phrase</label>
              <textarea
                placeholder="word1 word2 word3 ..."
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                style={styles.textarea}
                rows={3}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>New Password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button
              onClick={handleImportWallet}
              disabled={loading}
              style={styles.primaryButton}
            >
              {loading ? 'Importing...' : 'Import Wallet'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

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
  content: {
    width: '100%',
    maxWidth: '340px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  logo: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '8px',
    textAlign: 'center' as const,
    fontFamily: 'Doto, sans-serif',
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '32px',
    textAlign: 'center' as const,
    fontFamily: 'Doto, sans-serif',
  },
  primaryButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: '#ff76a8',
    color: '#000000',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontFamily: 'Doto, sans-serif',
    marginBottom: '12px',
  },
  secondaryButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Doto, sans-serif',
  },
  backButton: {
    alignText: 'left' as const,
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
    cursor: 'pointer',
    marginBottom: '16px',
    width: '100%',
    textAlign: 'left' as const,
    fontFamily: 'Doto, sans-serif',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'Doto, sans-serif',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    fontFamily: 'Doto, sans-serif',
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    resize: 'none' as const,
    fontFamily: 'Doto, sans-serif',
  },
  error: {
    color: '#ff76a8',
    fontSize: '13px',
    margin: '0',
    fontFamily: 'Doto, sans-serif',
  },
  mnemonicBox: {
    width: '100%',
    padding: '16px',
    borderRadius: '12px',
    background: 'rgba(255, 118, 168, 0.1)',
    border: '1px solid rgba(255, 118, 168, 0.3)',
    color: '#ffffff',
    fontSize: '14px',
    textAlign: 'center' as const,
    wordBreak: 'break-word' as const,
    fontFamily: 'Doto, sans-serif',
    marginBottom: '16px',
  },
  warning: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(255, 200, 0, 0.1)',
    border: '1px solid rgba(255, 200, 0, 0.3)',
    color: '#ffc800',
    fontSize: '12px',
    marginBottom: '20px',
    fontFamily: 'Doto, sans-serif',
  },
}

export default WalletSetupScreen
