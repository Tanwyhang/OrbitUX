'use client'

import React, { useState } from 'react'
import { motion, Easing } from 'framer-motion'
import { TokenETH, TokenUSDC, TokenDAI } from '@web3icons/react'

const speedrampEasing: Easing = [0.16, 1, 0.3, 1]
import { useZkp2pOnramp } from '@/hooks/useZkp2pOnramp'
// import { useZkp2pOfframp } from '@/hooks/useZkp2pOfframp'

export default function CardContent() {
  const [flipped, setFlipped] = useState(false)
  const { openOnramp, isLoading: isOnrampLoading, error: onrampError } = useZkp2pOnramp()
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
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex justify-center">
          <div className="relative" style={{ perspective: '1000px' }}>
            <div
              className="relative transition-transform duration-700 cursor-pointer"
              style={{
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                transformStyle: 'preserve-3d',
                width: '386px',
                height: '243px'
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

        <button
          onClick={handleAddFunds}
          disabled={isOnrampLoading}
          className="group mx-auto block w-[386px] rounded-xl bg-white border-2 border-[hsl(var(--pink))] px-6 py-4 text-xl font-bold text-[hsl(var(--pink))] hover:bg-[#ffd6e0] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isOnrampLoading ? 'Opening Onramp...' : 'Add Funds'}
        </button>

        {onrampError && (
          <div className="mx-auto mt-4 max-w-[386px] rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 whitespace-pre-line">
            <div className="font-semibold mb-2">Setup Required:</div>
            {onrampError}
            <a
              href="https://chromewebstore.google.com/detail/peerauth-authenticate-and/ijpgccednehjpeclfcllnjjcmiohdjih"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-center rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 transition-colors"
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
           className="mt-8 grid gap-8 lg:grid-cols-2"
         >
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6">
            <h3 className="text-lg font-semibold mb-4">Token Balances</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <TokenETH variant="branded" className="h-10 w-10" />
                  <div>
                    <div className="font-medium">ETH</div>
                    <div className="text-sm text-muted">Ethereum</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">1.2345 ETH</div>
                  <div className="text-sm text-muted">$3,456.78</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <TokenUSDC variant="branded" className="h-10 w-10" />
                  <div>
                    <div className="font-medium">USDC</div>
                    <div className="text-sm text-muted">USD Coin</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">15,432.10 USDC</div>
                  <div className="text-sm text-muted">$15,432.10</div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <TokenDAI variant="branded" className="h-10 w-10" />
                  <div>
                    <div className="font-medium">DAI</div>
                    <div className="text-sm text-muted">Dai Stablecoin</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">5,678.90 DAI</div>
                  <div className="text-sm text-muted">$5,679.01</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Received</div>
                    <div className="text-muted">0.5 ETH</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted">2 hours ago</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Sent</div>
                    <div className="text-muted">500 USDC</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted">1 day ago</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[hsl(var(--pink))]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[hsl(var(--pink))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">zkWormhole</div>
                    <div className="text-muted">Cross-chain</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted">3 days ago</div>
                </div>
                </div>
              </div>
            </div>
           </motion.div>
        </div>
      </div>
     )
   }


