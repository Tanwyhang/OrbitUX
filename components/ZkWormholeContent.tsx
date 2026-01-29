'use client'

import { useState } from 'react'

interface Recipient {
  id: number
  chain: string
  amount: string
  address: string
}

export default function ZkWormholeContent() {
  const [recipients, setRecipients] = useState<Recipient[]>([{ id: 0, chain: 'Polygon', amount: '100', address: '' }])
  const [sourceChain, setSourceChain] = useState('Ethereum')
  const nextId = recipients.length

  const addRecipient = () => {
    setRecipients([...recipients, { id: nextId, chain: 'Polygon', amount: '100', address: '' }])
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

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">zkWormhole</h1>
            <p className="mt-2 text-muted">Private cross-chain transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Source Chain:</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">{sourceChain}</span>
            </div>
          </div>
        </div>

        <button
          onClick={addRecipient}
          className="mb-6 w-full rounded-xl bg-white/10 border border-white/10 px-6 py-3 font-semibold text-white hover:bg-white/20 transition-colors"
        >
          + Add Recipient
        </button>

        <div className="space-y-4">
          {recipients.map((recipient) => (
            <div key={recipient.id} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted">Destination Chain</label>
                  <select
                    value={recipient.chain}
                    onChange={(e) => updateRecipient(recipient.id, 'chain', e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-[hsl(var(--pink))]"
                  >
                    <option>Ethereum</option>
                    <option>Polygon</option>
                    <option>Arbitrum</option>
                    <option>Optimism</option>
                    <option>Base</option>
                  </select>

                  <label className="text-sm text-muted">Address</label>
                  <input
                    type="text"
                    value={recipient.address}
                    onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                    placeholder="0x1234...5678"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-[hsl(var(--pink))] font-mono text-sm"
                  />

                  <label className="text-sm text-muted">Amount</label>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <input
                      type="text"
                      value={recipient.amount}
                      onChange={(e) => updateRecipient(recipient.id, 'amount', e.target.value)}
                      placeholder="100$ USDC"
                      className="flex-1 bg-transparent text-lg font-semibold outline-none"
                    />
                    <span className="text-sm font-medium whitespace-nowrap">USDC</span>
                  </div>
                </div>

                <button
                  onClick={() => removeRecipient(recipient.id)}
                  className="rounded-lg bg-white/10 border border-white/10 p-2 hover:bg-white/20 transition-colors text-white/50 hover:text-red-400"
                  aria-label="Remove recipient"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {recipients.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted">Total Amount</div>
                  <div className="text-3xl font-bold text-[hsl(var(--pink))]">
                    {getTotalAmount().toLocaleString()}$ USDC
                  </div>
                </div>
                <button className="w-full rounded-xl bg-white px-6 py-4 font-semibold text-[hsl(var(--pink))] group hover:invert">
                  Send {recipients.length} Transaction{recipients.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Privacy Features</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 rounded-full bg-[hsl(var(--pink))]/20 flex items-center justify-center">
                    <svg className="w-3 h-3 text-[hsl(var(--pink))]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Zero-Knowledge Proofs</div>
                    <div className="text-sm text-muted">Verify without revealing transaction details</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 rounded-full bg-[hsl(var(--pink))]/20 flex items-center justify-center">
                    <svg className="w-3 h-3 text-[hsl(var(--pink))]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Stealth Addresses</div>
                    <div className="text-sm text-muted">Hide recipient identity</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 rounded-full bg-[hsl(var(--pink))]/20 flex items-center justify-center">
                    <svg className="w-3 h-3 text-[hsl(var(--pink))]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">Ring Signatures</div>
                    <div className="text-sm text-muted">Obfuscate transaction origin</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Network Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-white" />
                    <span className="text-sm">Ethereum</span>
                  </div>
                  <span className="text-sm text-muted">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-white" />
                    <span className="text-sm">Polygon</span>
                  </div>
                  <span className="text-sm text-muted">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-white" />
                    <span className="text-sm">Arbitrum</span>
                  </div>
                  <span className="text-sm text-muted">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[hsl(var(--pink))]" />
                    <span className="text-sm">Optimism</span>
                  </div>
                  <span className="text-sm text-muted">Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
