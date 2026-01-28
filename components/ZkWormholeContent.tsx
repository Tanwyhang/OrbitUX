export default function ZkWormholeContent() {
  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold">Create Private Transfer</h3>
              <p className="mt-1 text-sm text-muted">Send tokens privately across chains</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted">Source Chain</label>
                <select className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-[hsl(var(--pink))]">
                  <option>Ethereum</option>
                  <option>Arbitrum</option>
                  <option>Optimism</option>
                  <option>Polygon</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted">Destination Chain</label>
                <select className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-[hsl(var(--pink))]">
                  <option>Polygon</option>
                  <option>Ethereum</option>
                  <option>Arbitrum</option>
                  <option>Optimism</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted">Amount</label>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <input
                    type="text"
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-lg font-semibold outline-none"
                  />
                  <span className="text-sm font-medium">USDC</span>
                </div>
              </div>

              <button className="w-full rounded-xl bg-[hsl(var(--pink))] py-4 font-semibold text-black hover:opacity-90 transition-opacity">
                Create Private Transfer
              </button>
            </div>
          </div>

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
                    <div className="h-2 w-2 rounded-full bg-[hsl(var(--pink))]" />
                    <span className="text-sm">Arbitrum</span>
                  </div>
                  <span className="text-sm text-muted">Maintenance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
