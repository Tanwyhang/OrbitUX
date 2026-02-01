'use client'

import React, { useState } from 'react'
import { motion, Easing } from 'framer-motion'
import { TokenETH, TokenUSDC, TokenDAI } from '@web3icons/react'

const speedrampEasing: Easing = [0.16, 1, 0.3, 1]
import { useZkp2pOnramp } from '@/hooks/useZkp2pOnramp'
import { useZkp2pOfframp } from '@/hooks/useZkp2pOfframp'

export default function CardContent() {
  const [flipped, setFlipped] = useState(false)
  const { openOnramp, isLoading: isOnrampLoading, error: onrampError } = useZkp2pOnramp()
  const { createDeposit, isLoading: isOfframpLoading, error: offrampError } = useZkp2pOfframp()

  const handleAddFunds = async () => {
    try {
      await openOnramp({
        // Polygon: 137:0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
        toToken: '137:0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        paymentPlatform: 'wise',
        inputAmount: 10,
        // You can optionally specify recipient address
        // recipientAddress: '0x...',
      })
    } catch (err) {
      // Error is handled by the hook, but we can add additional handling here
      console.error('Failed to open onramp:', err)
    }
  }

  const handleSellToken = async () => {
    try {
      // Create a deposit for offramp (selling tokens for fiat)
      // This creates a liquidity pool where users can swap tokens for fiat
      await createDeposit({
        // USDC on Base (use appropriate address for your chain)
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        amount: BigInt('5000000'), // 5 USDC (6 decimals)
        intentAmountRange: {
          min: BigInt('1000000'), // 1 USDC minimum per transaction
          max: BigInt('5000000'), // 5 USDC maximum per transaction
        },
        processorNames: ['wise'], // Only Wise
        depositData: [
          { email: 'hoshaomun0479@gmail.com' }, // Your Wise email
        ],
        conversionRates: [
          [{ currency: 'USD', conversionRate: '1000000000001000000' }], // 1.000000000001 (18 decimals)
        ],
      })
    } catch (err) {
      console.error('Failed to create deposit:', err)
    }
  }

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
                  <div className="relative h-full w-full rounded-2xl bg-gradient-to-br from-[hsl(var(--pink))] via-gray-200 to-white p-6 shadow-2xl">                  <div className="h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Orbit</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-black/60">PRIVATE</div>
                        <div className="text-lg font-bold text-black">$24,567.89</div>
                      </div>
                    </div>

                    <div className="text-black">
                      <div className="text-xs text-black/60 mb-1">Card Number</div>
                      <div className="text-xl font-bold">•••• •••• •••• 4582</div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-black/60 mb-1">Balance</div>
                        <div className="text-lg font-bold text-black">1.2345 ETH</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-black/60 mb-1">Valid Thru</div>
                        <div className="text-sm font-semibold text-black">12/28</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="absolute inset-0 backface-hidden"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <div className="relative h-full w-full rounded-2xl bg-white">
                  <div className="absolute top-6 left-6">
                    <svg width="40" height="30" viewBox="0 0 40 30">
                      <rect width="40" height="30" rx="3" fill="#D4AF37" />
                      <rect x="5" y="5" width="8" height="8" rx="1" fill="#F4D03F" />
                      <rect x="27" y="5" width="8" height="8" rx="1" fill="#F4D03F" />
                      <rect x="5" y="17" width="8" height="8" rx="1" fill="#F4D03F" />
                      <rect x="16" y="11" width="8" height="8" rx="1" fill="#F4D03F" />
                      <rect x="27" y="17" width="8" height="8" rx="1" fill="#F4D03F" />
                    </svg>
                  </div>
                  <div className="h-full flex items-center justify-center">
                    <img src="/orbit.png" alt="Orbit" width={150} height={150} className="object-contain" />
                  </div>
                  </div>
                </div>
            </div>
            </div>
          </div>

        <button
          onClick={handleAddFunds}
          disabled={isOnrampLoading}
          className="group mx-auto block w-[386px] rounded-xl bg-gradient-to-r from-[hsl(var(--pink))] to-purple-600 px-6 py-4 font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isOnrampLoading ? 'Opening Onramp...' : 'Add Funds'}
        </button>

        <button
          onClick={handleSellToken}
          disabled={isOfframpLoading}
          className="hidden group mx-auto mt-3 block w-[386px] rounded-xl border border-[hsl(var(--pink))]/10 bg-[hsl(var(--pink))]/10 px-6 py-4 font-semibold text-[hsl(var(--pink))] hover:bg-[hsl(var(--pink))]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isOfframpLoading ? 'Creating Deposit...' : 'Sell Token'}
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

        {offrampError && (
          <div className="mx-auto mt-4 max-w-[386px] rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-200 whitespace-pre-line">
            <div className="font-semibold mb-2">Offramp Error:</div>
            {offrampError}
            <div className="mt-3 text-xs opacity-80">
              Make sure you have USDC on Base and are connected to the correct network.
            </div>
          </div>
        )}

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


