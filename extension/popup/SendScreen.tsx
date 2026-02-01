// Send Screen Component - zkWormhole functionality for Orbit Wallet Extension
import React, { useState, useEffect } from 'react'

// Types
interface Recipient {
  id: number
  amount: string
  address: string
  token: string
}

interface Account {
  address: string
  railgunAddress?: string
  index: number
  label: string
}

interface SendScreenProps {
  account: Account | null
  onBack?: () => void
}

// Stablecoin options
const STABLECOINS = [
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'USDT', name: 'Tether USD' },
  { symbol: 'DAI', name: 'Dai Stablecoin' },
]

const SendScreen: React.FC<SendScreenProps> = ({ account, onBack }) => {
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: 0, amount: '', address: '', token: 'USDC' }
  ])
  const [nextId, setNextId] = useState(1)
  const [sending, setSending] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const addRecipient = () => {
    setRecipients([...recipients, { id: nextId, amount: '', address: '', token: 'USDC' }])
    setNextId(nextId + 1)
  }

  const removeRecipient = (id: number) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter(r => r.id !== id))
    }
  }

  const updateRecipient = (id: number, field: keyof Recipient, value: string) => {
    setRecipients(recipients.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const isValidAddress = (address: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }

  const getTotalAmount = () => {
    const totals: Record<string, number> = {}
    recipients.forEach(r => {
      const amount = parseFloat(r.amount) || 0
      totals[r.token] = (totals[r.token] || 0) + amount
    })
    return totals
  }

  const canSend = () => {
    if (recipients.length === 0) return false
    return recipients.every(r => isValidAddress(r.address) && parseFloat(r.amount) > 0)
  }

  const handleSend = async () => {
    if (!canSend()) return

    setSending(true)

    // Send message to background script to handle the transaction
    chrome.runtime.sendMessage(
      {
        type: 'SEND_TRANSACTION',
        recipients: recipients.map(r => ({
          address: r.address,
          amount: r.amount,
          token: r.token,
        })),
      },
      (response) => {
        setSending(false)
        if (response?.success) {
          setTxHash(response.txHash)
          setShowResult(true)
        } else {
          alert(response?.error || 'Transaction failed')
        }
      }
    )
  }

  const handleCloseResult = () => {
    setShowResult(false)
    setTxHash(null)
    setRecipients([{ id: 0, amount: '', address: '', token: 'USDC' }])
    setNextId(1)
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
        <h2 style={styles.title}>Send</h2>
        <div style={styles.headerSpacer}></div>
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

      {/* Recipients List */}
      <div style={styles.recipientsContainer}>
        <div style={styles.recipientsHeader}>
          <span style={styles.recipientsTitle}>Recipients</span>
          <button onClick={addRecipient} style={styles.addButton}>
            + Add
          </button>
        </div>

        {recipients.map((recipient, index) => (
          <div key={recipient.id} style={styles.recipientCard}>
            <div style={styles.recipientLabel}>
              Recipient {index + 1}
            </div>

            <div style={styles.inputGroup}>
              <input
                type="text"
                value={recipient.address}
                onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                placeholder="0x... address"
                style={{
                  ...styles.input,
                  ...(recipient.address && !isValidAddress(recipient.address) ? styles.inputError : {})
                }}
              />
            </div>

            <div style={styles.amountRow}>
              <input
                type="number"
                value={recipient.amount}
                onChange={(e) => updateRecipient(recipient.id, 'amount', e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={styles.amountInput}
              />
              <select
                value={recipient.token}
                onChange={(e) => updateRecipient(recipient.id, 'token', e.target.value)}
                style={styles.tokenSelect}
              >
                {STABLECOINS.map((coin) => (
                  <option key={coin.symbol} value={coin.symbol}>
                    {coin.symbol}
                  </option>
                ))}
              </select>
              {recipients.length > 1 && (
                <button
                  onClick={() => removeRecipient(recipient.id)}
                  style={styles.removeButton}
                >
                  ✕
                </button>
              )}
            </div>

            {recipient.address && !isValidAddress(recipient.address) && (
              <p style={styles.errorText}>Invalid address</p>
            )}
          </div>
        ))}
      </div>

      {/* Summary and Send Button */}
      {recipients.length > 0 && (
        <div style={styles.summaryCard}>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Total</span>
            <div style={styles.totalAmounts}>
              {Object.entries(getTotalAmount()).map(([token, amount]) => (
                <div key={token} style={styles.totalAmount}>
                  {amount.toLocaleString()} {token}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={handleSend}
            disabled={!canSend() || sending}
            style={{
              ...styles.sendButton,
              ...(canSend() && !sending ? styles.sendButtonActive : {}),
            }}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}

      {/* Result Modal */}
      {showResult && (
        <div style={styles.modalOverlay} onClick={handleCloseResult}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.successIcon}>✓</div>
            <h3 style={styles.modalTitle}>Transaction Sent!</h3>
            {txHash && (
              <div style={styles.txHashContainer}>
                <p style={styles.txHashLabel}>Transaction Hash</p>
                <p style={styles.txHash}>
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </p>
              </div>
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
  headerSpacer: {
    width: '40px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
    fontFamily: 'Doto, sans-serif',
  },
  accountCard: {
    padding: '16px',
    margin: '16px 20px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 118, 168, 0.2)',
  },
  accountLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '4px',
  },
  accountAddress: {
    fontSize: '14px',
    fontWeight: 'bold',
    fontFamily: 'Doto, sans-serif',
    margin: 0,
  },
  recipientsContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 20px',
  },
  recipientsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  recipientsTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  addButton: {
    background: 'rgba(255, 118, 168, 0.2)',
    border: '1px solid rgba(255, 118, 168, 0.3)',
    borderRadius: '6px',
    padding: '6px 12px',
    color: '#ff76a8',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  recipientCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '16px',
    marginBottom: '12px',
  },
  recipientLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '8px',
  },
  inputGroup: {
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'Doto, sans-serif',
  },
  inputError: {
    borderColor: 'rgba(255, 100, 100, 0.5)',
  },
  amountRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 'bold',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'Doto, sans-serif',
  },
  tokenSelect: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'Doto, sans-serif',
  },
  removeButton: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '8px',
    transition: 'color 0.2s',
  },
  errorText: {
    fontSize: '12px',
    color: '#ff76a8',
    margin: '8px 0 0 0',
  },
  summaryCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    margin: '16px 20px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  totalAmounts: {
    marginTop: '4px',
  },
  totalAmount: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ff76a8',
  },
  sendButton: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'not-allowed',
    transition: 'all 0.2s',
    fontFamily: 'Doto, sans-serif',
  },
  sendButtonActive: {
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
    marginBottom: '20px',
  },
  txHashLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    margin: '0 0 4px 0',
  },
  txHash: {
    fontSize: '14px',
    fontFamily: 'monospace',
    color: '#ffffff',
    margin: 0,
    wordBreak: 'break-all' as const,
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

export default SendScreen
