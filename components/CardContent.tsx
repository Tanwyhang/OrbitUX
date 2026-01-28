'use client'

import React, { useState } from 'react'

export default function CardContent() {
  const [flipped, setFlipped] = useState(false)

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

        <button className="mx-auto block w-[386px] rounded-xl border border-white/10 bg-white/5 px-6 py-4 font-semibold text-white hover:bg-white/10 transition-colors backdrop-blur-xl">
          Add Funds
        </button>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Token Balances</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white" />
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
                  <div className="h-10 w-10 rounded-full bg-[hsl(var(--pink))]" />
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
                  <div className="h-10 w-10 rounded-full bg-white" />
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

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
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
        </div>
      </div>
    </div>
  )
}
