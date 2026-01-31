// Receive Screen Component - Show QR code and wallet address with stealth mode toggle
import React, { useState, useEffect, useRef } from 'react'

// Types
interface Account {
  address: string
  railgunAddress?: string
  index: number
  label: string
}

interface ReceiveScreenProps {
  account: Account | null
  onBack?: () => void
}

// Simple QR code generator using Canvas API (no external dependencies)
const generateQRCode = (text: string): string => {
  // Create a simple QR code using a public API (for extension compatibility)
  // Using goqr.me API which is free and doesn't require CORS
  const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&bgcolor=000000&color=ffffff`
  return apiUrl
}

const ReceiveScreen: React.FC<ReceiveScreenProps> = ({ account, onBack }) => {
  const [stealthMode, setStealthMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrUrl, setQrUrl] = useState<string>('')

  // Get current address based on stealth mode
  const currentAddress = stealthMode && account?.railgunAddress
    ? account.railgunAddress
    : account?.address || ''

  const addressLabel = stealthMode ? 'Stealth Address (RAILGUN)' : 'Public Wallet Address'
  const addressType = stealthMode ? 'stealth' : 'public'

  // Update QR code when address or stealth mode changes
  useEffect(() => {
    if (currentAddress) {
      setQrUrl(generateQRCode(currentAddress))
    }
  }, [currentAddress, stealthMode])

  const toggleStealthMode = () => {
    if (account?.railgunAddress) {
      setStealthMode(!stealthMode)
      setCopied(false)
    }
  }

  const copyAddress = () => {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const shareAddress = async () => {
    if (navigator.share && currentAddress) {
      try {
        await navigator.share({
          title: 'My Wallet Address',
          text: currentAddress,
        })
      } catch (err) {
        // User cancelled or sharing failed
        console.log('Share failed:', err)
      }
    }
  }

  const canShare = navigator.share

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={styles.backButton}>
            ←
          </button>
        )}
        <h2 style={styles.title}>Receive</h2>
        <div style={styles.headerSpacer}></div>
      </div>

      {/* Stealth Mode Toggle */}
      {account?.railgunAddress && (
        <div style={styles.toggleContainer}>
          <span style={styles.toggleLabel}>Stealth Mode</span>
          <button
            onClick={toggleStealthMode}
            style={{
              ...styles.toggle,
              ...(stealthMode ? styles.toggleActive : {}),
            }}
          >
            <div style={{
              ...styles.toggleKnob,
              ...(stealthMode ? styles.toggleKnobActive : {})
            }}></div>
          </button>
        </div>
      )}

      {/* QR Code */}
      <div style={styles.qrContainer}>
        {qrUrl ? (
          <img
            src={qrUrl}
            alt="QR Code"
            style={styles.qrCode}
            crossOrigin="anonymous"
          />
        ) : (
          <div style={styles.qrPlaceholder}>
            <span style={styles.placeholderText}>Loading QR...</span>
          </div>
        )}
        <p style={styles.scanHint}>Scan this QR code to receive funds</p>
      </div>

      {/* Address Display */}
      <div style={styles.addressSection}>
        <p style={styles.addressLabel}>{addressLabel}</p>
        <div style={styles.addressBox}>
          <span style={styles.addressText}>{currentAddress}</span>
          <div style={styles.addressActions}>
            <button
              style={styles.actionButton}
              onClick={copyAddress}
              title="Copy address"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.checkIcon}>
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.iconSvg}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
            {canShare && (
              <button
                style={styles.actionButton}
                onClick={shareAddress}
                title="Share address"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={styles.iconSvg}>
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
              </button>
            )}
          </div>
        </div>
        {copied && (
          <p style={styles.copiedNotice}>Address copied to clipboard!</p>
        )}
      </div>

      {/* Warning for stealth mode */}
      {stealthMode && (
        <div style={styles.warningBox}>
          <p style={styles.warningText}>
            ⚠️ Only send supported tokens to your stealth address. Make sure the sender knows how to send private transactions.
          </p>
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
  headerSpacer: {
    width: '40px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
    fontFamily: 'Doto, sans-serif',
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    margin: '0 20px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  toggleLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  toggle: {
    width: '52px',
    height: '28px',
    borderRadius: '14px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    cursor: 'pointer',
    padding: '2px',
    position: 'relative' as const,
    transition: 'all 0.3s ease',
  },
  toggleActive: {
    background: 'rgba(255, 118, 168, 0.3)',
    borderColor: '#ff76a8',
  },
  toggleKnob: {
    width: '22px',
    height: '22px',
    borderRadius: '11px',
    background: 'rgba(255, 255, 255, 0.6)',
    transition: 'all 0.3s ease',
  },
  toggleKnobActive: {
    background: '#ff76a8',
    transform: 'translateX(24px)',
  },
  qrContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '24px 20px',
  },
  qrCode: {
    width: '200px',
    height: '200px',
    borderRadius: '12px',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    background: '#ffffff',
    padding: '8px',
  },
  qrPlaceholder: {
    width: '200px',
    height: '200px',
    borderRadius: '12px',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '14px',
  },
  scanHint: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: '16px',
    textAlign: 'center' as const,
    margin: '16px 20px 0',
  },
  addressSection: {
    padding: '0 20px',
    marginBottom: '16px',
  },
  addressLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '8px',
    textAlign: 'center' as const,
  },
  addressBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  addressText: {
    fontSize: '11px',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
    color: '#ffffff',
    lineHeight: 1.4,
    textAlign: 'center' as const,
  },
  addressActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  actionButton: {
    background: 'rgba(255, 118, 168, 0.2)',
    border: '1px solid rgba(255, 118, 168, 0.3)',
    borderRadius: '6px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSvg: {
    color: '#ffffff',
  },
  checkIcon: {
    color: '#00ff64',
  },
  copiedNotice: {
    fontSize: '12px',
    color: '#00ff64',
    textAlign: 'center' as const,
    marginTop: '8px',
    margin: '8px 0 0 0',
  },
  warningBox: {
    margin: '0 20px 20px',
    padding: '12px',
    background: 'rgba(255, 200, 0, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 200, 0, 0.2)',
  },
  warningText: {
    fontSize: '12px',
    color: 'rgba(255, 200, 0, 0.9)',
    margin: 0,
    lineHeight: 1.4,
  },
}

export default ReceiveScreen
