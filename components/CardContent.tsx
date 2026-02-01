'use client'

import React, { useState } from 'react'
import { motion, Easing, AnimatePresence } from 'framer-motion'
import { TokenETH, TokenUSDC, TokenDAI, TokenUSDT, TokenEURC, TokenWBTC, TokenLINK, TokenUNI, TokenOP, TokenBNB, TokenMATIC, TokenARB } from '@web3icons/react'
import { X, ChevronRight } from 'lucide-react'

const speedrampEasing: Easing = [0.16, 1, 0.3, 1]
import { useZkp2pOnramp } from '@/hooks/useZkp2pOnramp'
// import { useZkp2pOfframp } from '@/hooks/useZkp2pOfframp'

type Token = 'ETH' | 'USDC' | 'DAI' | 'USDT' | 'EURC' | 'WBTC' | 'LINK' | 'UNI' | 'OP' | 'BNB' | 'MATIC' | 'ARB'

const TOKENS: { symbol: Token; name: string; icon: React.ReactNode }[] = [
  { symbol: 'ETH', name: 'Ethereum', icon: <TokenETH variant="branded" /> },
  { symbol: 'USDC', name: 'USD Coin', icon: <TokenUSDC variant="branded" /> },
  { symbol: 'USDT', name: 'Tether USD', icon: <TokenUSDT variant="branded" /> },
  { symbol: 'DAI', name: 'Dai Stablecoin', icon: <TokenDAI variant="branded" /> },
  { symbol: 'EURC', name: 'Euro Coin', icon: <TokenEURC variant="branded" /> },
  { symbol: 'WBTC', name: 'Wrapped BTC', icon: <TokenWBTC variant="branded" /> },
  { symbol: 'LINK', name: 'Chainlink', icon: <TokenLINK variant="branded" /> },
  { symbol: 'UNI', name: 'Uniswap', icon: <TokenUNI variant="branded" /> },
  { symbol: 'OP', name: 'Optimism', icon: <TokenOP variant="branded" /> },
  { symbol: 'BNB', name: 'BNB', icon: <TokenBNB variant="branded" /> },
  { symbol: 'MATIC', name: 'Polygon', icon: <TokenMATIC variant="branded" /> },
  { symbol: 'ARB', name: 'Arbitrum', icon: <TokenARB variant="branded" /> },
]

export default function CardContent() {
  const [flipped, setFlipped] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [requestAmount, setRequestAmount] = useState('')
  const [showNfcTap, setShowNfcTap] = useState(false)
  const { openOnramp, isLoading: isOnrampLoading, error: onrampError } = useZkp2pOnramp()
  const { createDeposit, isCreatingDeposit: isOfframpLoading, error: offrampError } = useZkp2pOfframp(null)
  // const { createDeposit, isCreatingDeposit, error: offrampError } = useZkp2pOfframp(null)

  const handleAddFunds = async () => {
    try {
      await openOnramp({
        // Base: 8453:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
        toToken: '8453:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        paymentPlatform: 'wise',
        inputAmount: 2,
        recipientAddress: '0x40cCB8B947839a1c68F77632FA34e7930B352B61',
      })
    } catch (err) {
      // Error is handled by the hook, but we can add additional handling here
      console.error('Failed to open onramp:', err)
    }
  }

  // const handleSellToken = async () => {
  //   try {
  //     // Create a deposit for offramp (selling tokens for fiat)
  //     // This creates a liquidity pool where users can swap tokens for fiat
  //     await createDeposit({
  //       // USDC on Base (use appropriate address for your chain)
  //       token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  //       amount: BigInt('5000000'), // 5 USDC (6 decimals)
  //       intentAmountRange: {
  //         min: BigInt('1000000'), // 1 USDC minimum per transaction
  //         max: BigInt('5000000'), // 5 USDC maximum per transaction
  //       },
  //       processorNames: ['wise'], // Only Wise
  //       depositData: [
  //         { email: 'hoshaomun0479@gmail.com' }, // Your Wise email
  //       ],
  //       conversionRates: [
  //         [{ currency: 'USD', conversionRate: '1000000000001000000' }], // 1.000000000001 (18 decimals)
  //       ],
  //     })
  //   } catch (err) {
  //     console.error('Failed to create deposit:', err)
  //   }
  // }

  return (
    <>
    <div className="px-4 sm:px-6 py-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 sm:mb-8 flex justify-center">
          <div className="relative" style={{ perspective: '1000px' }}>
            <div
              className="relative transition-transform duration-700 cursor-pointer mx-auto"
              style={{
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                transformStyle: 'preserve-3d',
                width: 'min(386px, 98%)',
                maxWidth: '350px',
                height: 'min(243px, calc(386px * 0.63))',
                aspectRatio: '386/243'
              }}
              onClick={() => setFlipped(!flipped)}
            >
              <div className="absolute inset-0 backface-hidden">
                <div className="relative h-full w-full rounded-2xl p-6 shadow-2xl" style={{ background: 'radial-gradient(circle at center, white 10%, #ffd6e0 100%)' }}>
                  {/* Card Chip - Middle Left */}
                  <div className="absolute left-6 top-1/2 -translate-y-1/2">
                    <svg width="50" height="40" viewBox="0 0 50 40">
                      <rect width="50" height="40" rx="4" fill="#D4AF37" />
                      <rect x="5" y="5" width="12" height="12" rx="2" fill="#F4D03F" />
                      <rect x="33" y="5" width="12" height="12" rx="2" fill="#F4D03F" />
                      <rect x="5" y="23" width="12" height="12" rx="2" fill="#F4D03F" />
                      <rect x="19" y="14" width="12" height="12" rx="2" fill="#F4D03F" />
                      <rect x="33" y="23" width="12" height="12" rx="2" fill="#F4D03F" />
                    </svg>
                  </div>

                  {/* Orbit Logo - Center */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <img src="/orbit-transparent.png" alt="Orbit" width={140} height={140} className="object-contain" />
                  </div>

                  {/* ZKP2P Logo - Right Bottom */}
                  <div className="absolute right-6 bottom-6">
                    <img src="/zkp2p.svg" alt="ZKP2P" width={40} height={40} className="object-contain" />
                  </div>
                </div>
              </div>

              <div
                className="absolute inset-0 backface-hidden"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <div className="relative h-full w-full rounded-2xl bg-gradient-to-br from-[hsl(var(--pink))] via-gray-200 to-white">
                  {/* Magnetic Stripe - Thick line (lowered) */}
                  <div className="absolute top-8 left-0 right-0 h-12 bg-black" />

                  {/* Card Details - Left Bottom */}
                  <div className="absolute bottom-6 left-6 text-black">
                    <div className="text-xs text-black/60 mb-1">Card Number</div>
                    <div className="text-lg font-bold tracking-wider">•••• •••• •••• 4582</div>

                    <div className="mt-3 flex gap-6">
                      <div>
                        <div className="text-xs text-black/60 mb-1">Valid Thru</div>
                        <div className="text-sm font-semibold">12/28</div>
                      </div>
                      <div>
                        <div className="text-xs text-black/60 mb-1">CVV</div>
                        <div className="text-sm font-semibold">•••</div>
                      </div>
                    </div>
                  </div>

                  {/* Contactless Wave Icon - Right Side */}
                  <div className="absolute right-6 top-1/2 -translate-y-1/2">
                    <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                      <path d="M30 30V10M30 50V30" stroke="#333" strokeWidth="3" strokeLinecap="round"/>
                      <path d="M22 38C18 34 18 26 22 22M38 38C42 34 42 26 38 22M14 44C8 38 8 22 14 16M46 44C52 38 52 22 46 16"
                            stroke="#333"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeOpacity="0.6"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

        <div className="flex flex-col sm:flex-row gap-3 max-w-[386px] mx-auto">
          <button
            onClick={handleAddFunds}
            disabled={isOnrampLoading}
            className="group flex-1 rounded-xl bg-white border-2 border-[hsl(var(--pink))] px-4 sm:px-6 py-3 sm:py-4 text-lg sm:text-xl font-bold text-[hsl(var(--pink))] hover:bg-[#ffd6e0] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isOnrampLoading ? 'Opening Onramp...' : 'Add Funds'}
          </button>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex-1 rounded-xl bg-gradient-to-r from-[hsl(var(--pink))] to-purple-600 border-2 border-[hsl(var(--pink))] px-4 sm:px-6 py-3 sm:py-4 text-lg sm:text-xl font-bold text-white hover:opacity-90 transition-all"
          >
            Request
          </button>
        </div>

        {onrampError && (
          <div className="mx-auto mt-4 max-w-[386px] rounded-lg border border-red-500/30 bg-red-500/10 p-3 sm:p-4 text-sm text-red-200 whitespace-pre-line">
            <div className="font-semibold mb-2">Setup Required:</div>
            {onrampError}
            <a
              href="https://chromewebstore.google.com/detail/peerauth-authenticate-and/ijpgccednehjpeclfcllnjjcmiohdjih"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-center rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-sm sm:text-base transition-colors"
            >
              Open Chrome Web Store
            </a>
          </div>
        )}

        {/* Offramp button and error temporarily disabled */}
        {/* <button
          onClick={handleSellToken}
          disabled={isCreatingDeposit}
          className="hidden group mx-auto mt-3 block w-[386px] rounded-xl bg-[hsl(var(--pink))] border-2 border-[hsl(var(--pink))] px-6 py-4 font-semibold text-white hover:bg-white hover:text-[hsl(var(--pink))] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isCreatingDeposit ? 'Creating Deposit...' : 'Sell Token'}
        </button>

        {offrampError && (
          <div className="mx-auto mt-4 max-w-[386px] rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-200 whitespace-pre-line">
            <div className="font-semibold mb-2">Offramp Error:</div>
            {offrampError.message}
            <div className="mt-3 text-xs opacity-80">
              Make sure you have USDC on Base and are connected to the correct network.
            </div>
          </div>
        )} */}

         <motion.div
           initial={{ opacity: 0, y: 30 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.6, delay: 0.4, ease: speedrampEasing }}
           className="mt-6 sm:mt-8 grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2"
         >
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Token Balances</h3>
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <TokenETH variant="branded" className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-medium">ETH</div>
                    <div className="text-xs sm:text-sm text-muted">Ethereum</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm sm:text-base font-semibold">1.2345 ETH</div>
                  <div className="text-xs sm:text-sm text-muted">$3,456.78</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <TokenUSDC variant="branded" className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-medium">USDC</div>
                    <div className="text-xs sm:text-sm text-muted">USD Coin</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm sm:text-base font-semibold">15,432.10 USDC</div>
                  <div className="text-xs sm:text-sm text-muted">$15,432.10</div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <TokenDAI variant="branded" className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-medium">DAI</div>
                    <div className="text-xs sm:text-sm text-muted">Dai Stablecoin</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm sm:text-base font-semibold">5,678.90 DAI</div>
                  <div className="text-xs sm:text-sm text-muted">$5,679.01</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Recent Activity</h3>
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-medium">Received</div>
                    <div className="text-muted text-xs sm:text-sm">0.5 ETH</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted text-xs sm:text-sm">2 hours ago</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-medium">Sent</div>
                    <div className="text-muted text-xs sm:text-sm">500 USDC</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted text-xs sm:text-sm">1 day ago</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[hsl(var(--pink))]/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[hsl(var(--pink))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-medium">zkWormhole</div>
                    <div className="text-muted text-xs sm:text-sm">Cross-chain</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted text-xs sm:text-sm">3 days ago</div>
                </div>
                </div>
              </div>
            </div>
           </motion.div>
        </div>
      </div>

      {/* Request Payment Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowRequestModal(false)
                setSelectedToken(null)
                setRequestAmount('')
              }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999]"
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-8 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-[400px] h-[97vh] bg-black rounded-2xl border border-white/20 overflow-hidden pointer-events-auto flex flex-col"
              >
                {/* Token List View */}
                {!selectedToken && !showNfcTap ? (
                  <>
                    {/* Header with Close Button */}
                    <div className="p-6 border-b border-white/10 flex-shrink-0">
                      <button
                        onClick={() => {
                          setShowRequestModal(false)
                          setSelectedToken(null)
                          setRequestAmount('')
                        }}
                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                        <span className="font-medium">Close</span>
                      </button>
                    </div>

                    {/* Token List */}
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="space-y-2">
                        {TOKENS.map((token) => (
                          <button
                            key={token.symbol}
                            onClick={() => setSelectedToken(token.symbol)}
                            className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all group"
                          >
                            <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                              {token.icon}
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-white font-medium">{token.symbol}</div>
                              <div className="text-sm text-white/60">{token.name}</div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : showNfcTap ? (
                  <>
                    {/* NFC Tap Page */}
                    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
                      {/* Animated NFC Icon */}
                      <div className="relative mb-8 flex items-center justify-center">
                        {/* Pulsing rings - centered around icon */}
                        <motion.div
                          animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.5, 0, 0.5],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="absolute rounded-full border-2 border-[hsl(var(--pink))]"
                          style={{ width: '160px', height: '160px' }}
                        />
                        <motion.div
                          animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.3, 0, 0.3],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 0.3,
                          }}
                          className="absolute rounded-full border-2 border-[hsl(var(--pink))]"
                          style={{ width: '160px', height: '160px' }}
                        />

                        {/* Contactless Wave Icon - centered */}
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          className="w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center relative z-10"
                        >
                          <svg width="100" height="100" viewBox="0 0 100 100" fill="none" className="text-[hsl(var(--pink))]">
                            <motion.path
                              d="M50 50V20M50 80V50"
                              stroke="currentColor"
                              strokeWidth="4"
                              strokeLinecap="round"
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            />
                            <motion.path
                              d="M38 62C32 56 32 44 38 38M62 62C68 56 68 44 62 38"
                              stroke="currentColor"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeOpacity="0.8"
                              animate={{ opacity: [0.4, 0.8, 0.4] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                            />
                            <motion.path
                              d="M26 74C18 66 18 34 26 26M74 74C82 66 82 34 74 26"
                              stroke="currentColor"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeOpacity="0.6"
                              animate={{ opacity: [0.3, 0.6, 0.3] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                            />
                          </svg>
                        </motion.div>
                      </div>

                      {/* Instructions */}
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Tap to Pay</h2>
                        <p className="text-white/60 text-base sm:text-lg">
                          Move your card near the device
                        </p>
                      </motion.div>

                      {/* Payment Details */}
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="mt-8 sm:mt-12 w-full max-w-[280px] rounded-xl bg-white/5 border border-white/10 p-4 sm:p-6"
                      >
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center [&_svg]:w-full [&_svg]:h-full">
                            {TOKENS.find(t => t.symbol === selectedToken)!.icon}
                          </div>
                          <div className="text-3xl sm:text-4xl font-bold text-white">
                            {requestAmount}
                          </div>
                        </div>
                        <div className="text-center text-white/60 text-sm sm:text-base">
                          {selectedToken}
                        </div>
                      </motion.div>
                    </div>

                    {/* Close Button */}
                    <div className="p-4 border-t border-white/10 flex-shrink-0">
                      <button
                        onClick={() => {
                          setShowRequestModal(false)
                          setShowNfcTap(false)
                          setSelectedToken(null)
                          setRequestAmount('')
                        }}
                        className="w-full rounded-xl bg-white/10 border-2 border-white/20 px-4 py-3 text-base font-bold text-white hover:bg-white/20 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Header with Back Button */}
                    <div className="p-6 border-b border-white/10 flex-shrink-0">
                      <button
                        onClick={() => setSelectedToken(null)}
                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                        <span className="font-medium">Back</span>
                      </button>
                    </div>

                    {/* Content Container */}
                    <div className="flex-1 flex flex-col">
                      {/* Selected Token Display */}
                      <div className="px-6 pt-4 pb-2">
                        <div className="flex items-center justify-center gap-4 p-4 rounded-xl bg-white/5">
                          <div className="w-16 h-16 flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:!important">
                            {TOKENS.find(t => t.symbol === selectedToken)!.icon}
                          </div>
                          <div className="text-white text-3xl font-bold">
                            {selectedToken}
                          </div>
                        </div>
                      </div>

                      {/* Amount Input - Centered */}
                      <div className="flex-1 flex items-center justify-center px-6">
                        <input
                          type="number"
                          value={requestAmount}
                          onChange={(e) => setRequestAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full max-w-[280px] bg-transparent text-5xl font-bold text-white text-center focus:outline-none placeholder:text-white/20"
                        />
                      </div>
                    </div>

                    {/* Create Button */}
                    <div className="p-4 border-t border-white/10 flex-shrink-0">
                      <button
                        onClick={() => {
                          console.log('Creating payment request:', { token: selectedToken, amount: requestAmount })
                          setShowNfcTap(true)
                        }}
                        disabled={!requestAmount || parseFloat(requestAmount) <= 0}
                        className={`w-full rounded-xl px-4 py-3 text-base font-bold transition-all ${
                          requestAmount && parseFloat(requestAmount) > 0
                            ? 'bg-white text-black border-2 border-[hsl(var(--pink))]'
                            : 'bg-white/10 text-white/40 border-2 border-white/20 cursor-not-allowed'
                        }`}
                      >
                        Create Payment Request
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}


