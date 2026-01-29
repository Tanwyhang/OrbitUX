'use client'

import { useState } from 'react'

interface Token {
  symbol: string
  name: string
  color: string
}

interface Chain {
  id: string
  name: string
  icon: string
}

const TOKENS: Token[] = [
  { symbol: 'ETH', name: 'Ethereum', color: 'bg-white' },
  { symbol: 'USDC', name: 'USD Coin', color: 'bg-[hsl(var(--pink))]' },
  { symbol: 'DAI', name: 'Dai Stablecoin', color: 'bg-yellow-400' },
  { symbol: 'WBTC', name: 'Wrapped BTC', color: 'bg-orange-400' },
  { symbol: 'LINK', name: 'Chainlink', color: 'bg-blue-400' },
  { symbol: 'UNI', name: 'Uniswap', color: 'bg-pink-400' },
]

const CHAINS: Chain[] = [
  { id: 'ethereum', name: 'Ethereum', icon: '⟠' },
  { id: 'polygon', name: 'Polygon', icon: '⬡' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '⬡' },
  { id: 'optimism', name: 'Optimism', icon: '🔴' },
]

export default function SwapContent() {
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [fromToken, setFromToken] = useState(TOKENS[0])
  const [toToken, setToToken] = useState(TOKENS[1])
  const [selectedChain, setSelectedChain] = useState(CHAINS[0])
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false)
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false)
  const [showChainDropdown, setShowChainDropdown] = useState(false)

  const handleSwapDirection = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
  }

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 backdrop-blur p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Quick Swap</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">From</label>
                  <button
                    onClick={() => setShowChainDropdown(!showChainDropdown)}
                    className="flex items-center gap-2 text-xs text-muted hover:text-white transition-colors"
                  >
                    <span>{selectedChain.icon}</span>
                    <span>{selectedChain.name}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                    <button
                      onClick={() => setShowFromTokenDropdown(!showFromTokenDropdown)}
                      className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center text-xl hover:bg-white/10 transition-colors"
                    >
                      {fromToken.symbol[0]}
                    </button>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="0.00"
                        value={fromAmount}
                        onChange={(e) => setFromAmount(e.target.value)}
                        className="w-full bg-transparent text-2xl font-semibold outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setShowFromTokenDropdown(!showFromTokenDropdown)}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                    >
                      {fromToken.symbol}
                    </button>
                  </div>

                  {showFromTokenDropdown && (
                    <div className="rounded-xl border border-white/10 bg-black/50 backdrop-blur-2xl p-2 space-y-1 max-h-60 overflow-y-auto">
                      {TOKENS.map((token) => (
                        <button
                          key={token.symbol}
                          onClick={() => {
                            setFromToken(token)
                            setShowFromTokenDropdown(false)
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <div className={`h-8 w-8 rounded-full ${token.color} flex items-center justify-center text-xs font-bold`}>
                            {token.symbol[0]}
                          </div>
                          <div>
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-muted">{token.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {showChainDropdown && (
                <div className="rounded-xl border border-white/50 bg-black/50 backdrop-blur-2xl p-2 space-y-1">
                  {CHAINS.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={() => {
                        setSelectedChain(chain)
                        setShowChainDropdown(false)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                    >
                      <span className="text-xl">{chain.icon}</span>
                      <span className="font-medium">{chain.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-center -my-2 relative z-10">
                <button
                  onClick={handleSwapDirection}
                  className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10 transition-colors hover:scale-110 transform"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted">To</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                    <button
                      onClick={() => setShowToTokenDropdown(!showToTokenDropdown)}
                      className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center text-xl hover:bg-white/10 transition-colors"
                    >
                      {toToken.symbol[0]}
                    </button>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="0.00"
                        value={toAmount}
                        onChange={(e) => setToAmount(e.target.value)}
                        className="w-full bg-transparent text-2xl font-semibold outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setShowToTokenDropdown(!showToTokenDropdown)}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                    >
                      {toToken.symbol}
                    </button>
                  </div>

                  {showToTokenDropdown && (
                    <div className="rounded-xl border border-white/10 bg-black/50 backdrop-blur p-2 space-y-1 max-h-60 overflow-y-auto">
                      {TOKENS.map((token) => (
                        <button
                          key={token.symbol}
                          onClick={() => {
                            setToToken(token)
                            setShowToTokenDropdown(false)
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <div className={`h-8 w-8 rounded-full ${token.color} flex items-center justify-center text-xs font-bold`}>
                            {token.symbol[0]}
                          </div>
                          <div>
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-muted">{token.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button className="w-full rounded-xl bg-white px-4 py-4 font-semibold text-[hsl(var(--pink))] group hover:invert">
                Swap
              </button>
            </div>
          </div>


            </div>
          </div>
        </div>
  )
}
