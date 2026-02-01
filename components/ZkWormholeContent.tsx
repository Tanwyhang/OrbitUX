'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Shield, Wallet, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { TokenUSDC, TokenUSDT, TokenDAI } from '@web3icons/react'
import type { ComponentType, SVGProps } from 'react'
import { useRailgunWallet } from '@/hooks/useRailgunWallet'
import { useRailgunEngine } from '@/hooks/useRailgunEngine'
import { usePrivateTransfer, type TransferRecipient } from '@/hooks/usePrivateTransfer'
import { usePublicTransfer, type PublicTransferRecipient } from '@/hooks/usePublicTransfer'
import { useStealthMode } from './contexts/StealthModeContext'
import WalletSetup from './WalletSetup'
import PrivacyFlowUI from './PrivacyFlowUI'
import { PublicTransactionProgress, PublicTransactionResult } from './PublicTransactionUI'
import type { Stablecoin } from '@/app/api/railgun/stablecoins/route'

// Stablecoin icon mapping
type Web3IconComponent = ComponentType<SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono'; className?: string }>;
const STABLECOIN_ICONS: Record<string, Web3IconComponent> = {
  USDC: TokenUSDC,
  USDT: TokenUSDT,
  DAI: TokenDAI,
};

// Helper component to render stablecoin icon
function StablecoinIcon({ symbol, className }: { symbol: string; className?: string }) {
  const Icon = STABLECOIN_ICONS[symbol];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

interface Recipient {
  id: number
  amount: string
  address: string
  token: string // Token symbol (e.g., 'USDC', 'USDT', 'DAI')
}

export default function ZkWormholeContent() {
  const { address: connectedAddress, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { status: engineStatus, initialize: initializeEngine } = useRailgunEngine()
  const { status: walletStatus, wallet: railgunWallet } = useRailgunWallet()
  const { 
    isTransferring: isPrivateTransferring, 
    progress: privateProgress, 
    result: privateResult, 
    executePrivateTransfer, 
    resetTransfer: resetPrivateTransfer 
  } = usePrivateTransfer()
  const {
    isTransferring: isPublicTransferring,
    progress: publicProgress,
    result: publicResult,
    executePublicTransfer,
    resetTransfer: resetPublicTransfer
  } = usePublicTransfer()
  const { stealthMode, toggleStealthMode } = useStealthMode()

  // Get active transfer state based on mode
  const isTransferring = stealthMode ? isPrivateTransferring : isPublicTransferring

  const [recipients, setRecipients] = useState<Recipient[]>([
{ id: 0, amount: '67', address: '', token: 'USDC' }
  ])
  const [stablecoins, setStablecoins] = useState<Stablecoin[]>([])
  const [stablecoinsLoading, setStablecoinsLoading] = useState(true)
  const [sourceChain] = useState('Sepolia')
  const [nextId, setNextId] = useState(1)
  const [showWalletSetup, setShowWalletSetup] = useState(false)
  const [showResult, setShowResult] = useState(false)

  // Initialize RAILGUN engine on mount
  useEffect(() => {
    if (engineStatus === 'uninitialized') {
      initializeEngine()
    }
  }, [engineStatus, initializeEngine])

  // Fetch supported stablecoins on mount
  useEffect(() => {
    async function fetchStablecoins() {
      try {
        setStablecoinsLoading(true)
        const response = await fetch('/api/railgun/stablecoins')
        const data = await response.json()
        if (data.success && data.stablecoins) {
          setStablecoins(data.stablecoins)
        }
      } catch (error) {
        console.error('Failed to fetch stablecoins:', error)
        // Fallback to default
        setStablecoins([{ symbol: 'USDC', name: 'USD Coin', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 }])
      } finally {
        setStablecoinsLoading(false)
      }
    }
    fetchStablecoins()
  }, [])

  // Show result modal when transfer completes
  useEffect(() => {
    const result = stealthMode ? privateResult : publicResult
    if (result && !isTransferring) {
      setShowResult(true)
    }
  }, [privateResult, publicResult, isTransferring, stealthMode])

  const addRecipient = () => {
    setRecipients([...recipients, { id: nextId, amount: '67', address: '', token: 'USDC' }])
    setNextId(nextId + 1)
  }

  const removeRecipient = (id: number) => {
    setRecipients(recipients.filter(r => r.id !== id))
  }

  const updateRecipient = (id: number, field: keyof Recipient, value: string) => {
    setRecipients(recipients.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const getTotalAmount = () => {
    return recipients.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
  }

  const getTotalsByToken = () => {
    const totals: Record<string, number> = {}
    recipients.forEach(r => {
      const amount = parseFloat(r.amount) || 0
      totals[r.token] = (totals[r.token] || 0) + amount
    })
    return totals
  }

  const isValidAddress = (address: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }

  const canSend = () => {
    if (!isConnected) return false
    // Only require RAILGUN wallet in stealth mode
    if (stealthMode && walletStatus !== 'ready') return false
    if (recipients.length === 0) return false
    if (getTotalAmount() <= 0) return false
    return recipients.every(r => isValidAddress(r.address) && parseFloat(r.amount) > 0)
  }

  const handleSend = async () => {
    if (!canSend()) return

    if (stealthMode) {
      // Private transfer via RAILGUN
      const transferRecipients: TransferRecipient[] = recipients.map(r => ({
        address: r.address,
        amount: r.amount,
        token: r.token,
      }))

      try {
        await executePrivateTransfer(transferRecipients)
      } catch (error) {
        console.error('Private transfer failed:', error)
      }
    } else {
      // Public transfer (standard ERC20)
      const transferRecipients: PublicTransferRecipient[] = recipients.map(r => ({
        address: r.address,
        amount: r.amount,
        token: r.token,
      }))

      try {
        await executePublicTransfer(transferRecipients)
      } catch (error) {
        console.error('Public transfer failed:', error)
      }
    }
  }

  const handleCloseResult = () => {
    setShowResult(false)
    if (stealthMode) {
      resetPrivateTransfer()
      if (privateResult?.success) {
        setRecipients([{ id: 0, amount: '67', address: '', token: 'USDC' }])
        setNextId(1)
      }
    } else {
      resetPublicTransfer()
      if (publicResult?.success) {
        setRecipients([{ id: 0, amount: '67', address: '', token: 'USDC' }])
        setNextId(1)
      }
    }
  }

  const getButtonState = () => {
    if (!isConnected) {
      return { text: 'Connect Wallet', action: openConnectModal, disabled: false }
    }
    // Only require private wallet setup in stealth mode
    if (stealthMode && walletStatus !== 'ready') {
      return { text: 'Setup Private Wallet', action: () => setShowWalletSetup(true), disabled: false }
    }
    if (!canSend()) {
      return { text: 'Enter Valid Recipients', action: undefined, disabled: true }
    }
    if (stealthMode) {
      return { 
        text: `Send ${recipients.length} Private Transaction${recipients.length === 1 ? '' : 's'}`, 
        action: handleSend, 
        disabled: isTransferring 
      }
    } else {
      return { 
        text: `Send ${recipients.length} Transaction${recipients.length === 1 ? '' : 's'}`, 
        action: handleSend, 
        disabled: isTransferring 
      }
    }
  }

  const buttonState = getButtonState()

  return (
    <>
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">zkWormhole</h1>
              <p className="text-sm text-white/60">Private transfers on Sepolia</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              {/* Stealth Mode Switch */}
              <button
                onClick={toggleStealthMode}
                className={`flex items-center gap-1.5 sm:gap-2 rounded-lg border px-2 sm:px-3 py-1.5 transition-all duration-300 ease-in-out ${
                  stealthMode
                    ? 'border-[hsl(var(--pink))]/50 bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]'
                    : 'border-white/10 bg-black/30 text-white/60 hover:bg-white/5'
                }`}
              >
                {stealthMode ? (
                  <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span className="text-xs sm:text-sm font-medium">Stealth</span>
                <div
                  className={`relative w-8 sm:w-10 h-5 rounded-full transition-colors duration-300 ease-in-out ${
                    stealthMode ? 'bg-[hsl(var(--pink))]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-3.5 sm:h-4 w-3.5 sm:w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out ${
                      stealthMode ? 'translate-x-3.5 sm:translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>

              <span className="text-xs sm:text-sm text-muted">Source:</span>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 sm:px-3 py-1.5">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs sm:text-sm font-medium">{sourceChain}</span>
              </div>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="mb-3 sm:mb-4 flex flex-wrap gap-2">
            {/* Wallet Status */}
            {isConnected && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 sm:px-3 py-1.5">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/60" />
                <span className="text-xs sm:text-sm text-white/80 font-mono">
                  {connectedAddress?.slice(0, 5)}...{connectedAddress?.slice(-4)}
                </span>
              </div>
            )}

            {/* RAILGUN Wallet Status */}
            {walletStatus === 'ready' && railgunWallet && (
              <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--pink))]/30 bg-[hsl(var(--pink))]/10 px-2 sm:px-3 py-1.5">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[hsl(var(--pink))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--pink))] font-mono">
                  {railgunWallet.railgunAddress.slice(0, 8)}...
                </span>
              </div>
            )}

            {/* Engine Status */}
            {engineStatus === 'initializing' && (
              <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 sm:px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-xs sm:text-sm text-yellow-200">Initializing RAILGUN...</span>
              </div>
            )}
          </div>

          {/* Add Recipient Button */}
          <div className="mb-3 sm:mb-4 flex justify-end">
            <button
              onClick={addRecipient}
              className="rounded-lg bg-transparent border border-white/10 px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold text-white hover:bg-white/10 transition-colors backdrop-blur-xl"
            >
              + Add Recipient
            </button>
          </div>

          {/* Recipients List */}
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {recipients.map((recipient) => (
                <motion.div
                  key={recipient.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-xl"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  transition={{
                    duration: 0.3,
                    ease: [0, 0.63, 0.08, 0.99]
                  }}
                >
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div className="relative">
                        <input
                          type="text"
                          value={recipient.address}
                          onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                          placeholder="0x... recipient address"
                          className={`w-full rounded-lg border bg-black/30 px-2 sm:px-3 py-2 outline-none font-mono text-xs sm:text-sm transition-colors ${
                            recipient.address && !isValidAddress(recipient.address)
                              ? 'border-red-500/50 focus:border-red-500'
                              : 'border-white/10 focus:border-[hsl(var(--pink))]'
                          }`}
                        />
                        {recipient.address && !isValidAddress(recipient.address) && (
                          <p className="absolute -bottom-4 sm:-bottom-5 left-0 text-xs text-red-400">Invalid address</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 sm:px-3 py-2">
                        <input
                          type="number"
                          value={recipient.amount}
                          onChange={(e) => updateRecipient(recipient.id, 'amount', e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.01"
                          className="flex-1 bg-transparent text-base sm:text-lg font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <div className="flex items-center gap-2">
                          <StablecoinIcon symbol={recipient.token} className="h-5 w-5 sm:h-6 sm:w-6" />
                          <div className="relative">
                            <select
                              value={recipient.token}
                              onChange={(e) => updateRecipient(recipient.id, 'token', e.target.value)}
                              className="appearance-none bg-white/10 hover:bg-white/20 border border-white/10 rounded-md px-2 py-1 pr-5 sm:pr-6 text-xs sm:text-sm font-medium cursor-pointer outline-none focus:border-[hsl(var(--pink))] transition-colors"
                              disabled={stablecoinsLoading}
                            >
                              {stablecoinsLoading ? (
                                <option>Loading...</option>
                              ) : (
                                stablecoins.map((coin) => (
                                  <option key={coin.symbol} value={coin.symbol}>
                                    {coin.symbol}
                                  </option>
                                ))
                              )}
                            </select>
                            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 pointer-events-none text-white/60" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <motion.button
                      onClick={() => removeRecipient(recipient.id)}
                      className="rounded-lg bg-white/10 border border-white/10 p-1.5 sm:p-2 text-white/50 transition-colors flex-shrink-0 mt-1 sm:mt-0"
                      aria-label="Remove recipient"
                      whileHover={{
                        scale: 1.1,
                        backgroundColor: 'rgba(255, 255, 255, 0.15)',
                        color: 'rgb(248 113 113)',
                        transition: { duration: 0.2 }
                      }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Summary and Send Button */}
          {recipients.length > 0 && (
            <div className="mt-3 sm:mt-4 rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <div className="text-xs sm:text-sm text-muted">Total Amount</div>
                  <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1">
                    {Object.entries(getTotalsByToken()).map(([token, amount]) => (
                      <div key={token} className="text-xl sm:text-2xl font-bold text-[hsl(var(--pink))]">
                        {amount.toLocaleString()} {token}
                      </div>
                    ))}
                  </div>
                  {stealthMode && walletStatus === 'ready' ? (
                    <div className="text-xs text-[hsl(var(--pink))]/60 mt-1 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Sent privately via RAILGUN
                    </div>
                  ) : !stealthMode ? (
                    <div className="text-xs text-white/40 mt-1 flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      Standard transfer (publicly visible)
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={buttonState.action}
                  disabled={buttonState.disabled}
                  className="rounded-xl bg-white border border-white/10 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-[hsl(var(--pink))] group hover:invert disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:invert-0 transition-all whitespace-nowrap"
                >
                  {buttonState.text}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showWalletSetup && (
          <WalletSetup onComplete={() => setShowWalletSetup(false)} />
        )}
      </AnimatePresence>

      {/* Progress Modal - different for stealth vs public mode */}
      {/* Private (stealth) mode uses unified PrivacyFlowUI */}
      <PrivacyFlowUI
        isVisible={(isPrivateTransferring || (showResult && stealthMode && !!privateResult))}
        isTransferring={isPrivateTransferring}
        progress={privateProgress}
        result={privateResult}
        senderAddress={connectedAddress || ''}
        recipients={recipients.map(r => ({ address: r.address, amount: r.amount, token: r.token }))}
        totalAmount={getTotalAmount().toString()}
        token={recipients[0]?.token || 'USDC'}
        onClose={handleCloseResult}
      />

      <AnimatePresence>
        {isTransferring && !stealthMode && (
          <PublicTransactionProgress progress={publicProgress} />
        )}
      </AnimatePresence>

      {/* Result Modal - only for public mode (stealth mode handled by PrivacyFlowUI) */}
      <AnimatePresence>
        {showResult && !stealthMode && publicResult && (
          <PublicTransactionResult result={publicResult} onClose={handleCloseResult} />
        )}
      </AnimatePresence>
    </>
  )
}
