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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">zkWormhole</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Source Chain:</span>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">{sourceChain}</span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            onClick={addRecipient}
            className="rounded-lg bg-transparent border border-white/10 px-4 py-2 font-semibold text-white hover:bg-white/10 transition-colors backdrop-blur-1xl"
          >
            + Add Recipient
          </button>
        </div>

        <div className="grid gap-3">
          {recipients.map((recipient) => (
            <div key={recipient.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={recipient.chain}
                    onChange={(e) => updateRecipient(recipient.id, 'chain', e.target.value)}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-[hsl(var(--pink))] text-sm"
                  >
                    <option>Ethereum</option>
                    <option>Polygon</option>
                    <option>Arbitrum</option>
                    <option>Optimism</option>
                    <option>Base</option>
                  </select>

                  <input
                    type="text"
                    value={recipient.address}
                    onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                    placeholder="0x1234...5678"
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-[hsl(var(--pink))] font-mono text-sm"
                  />

                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    <input
                      type="text"
                      value={recipient.amount}
                      onChange={(e) => updateRecipient(recipient.id, 'amount', e.target.value)}
                      placeholder="100$ USDC"
                      className="flex-1 bg-transparent text-lg font-semibold outline-none"
                    />
                    <span className="text-sm font-medium whitespace-nowrap">USDC</span>
                  </div>

                  <button
                    onClick={() => removeRecipient(recipient.id)}
                    className="rounded-lg bg-white/10 border border-white/10 p-2 hover:bg-white/10 hover:text-red-400 text-white/50 transition-colors"
                    aria-label="Remove recipient"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {recipients.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted">Total Amount</div>
                <div className="text-2xl font-bold text-[hsl(var(--pink))]">
                  {getTotalAmount().toLocaleString()}$ USDC
                </div>
              </div>
              <button className="rounded-xl bg-white border border-white/10 px-6 py-3 font-semibold text-[hsl(var(--pink))] group hover:invert">
                Send {recipients.length} Transaction{recipients.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
