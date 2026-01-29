export default function SwapContent() {
  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Quick Swap</h3>
              <div className="h-2 w-2 rounded-full bg-[hsl(var(--pink))] animate-pulse" />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted">From</label>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="h-10 w-10 rounded-full bg-white" />
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl font-semibold outline-none"
                    />
                  </div>
                  <span className="text-sm font-medium">ETH</span>
                </div>
              </div>
              
              <div className="flex justify-center">
                <button className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted">To</label>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="h-10 w-10 rounded-full bg-[hsl(var(--pink))]" />
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl font-semibold outline-none"
                    />
                  </div>
                  <span className="text-sm font-medium">USDC</span>
                </div>
              </div>

              <button className="w-full rounded-xl bg-white px-4 py-4 font-semibold text-[hsl(var(--pink))] group hover:invert">
                Swap
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 md:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Recent Swaps</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white" />
                  <div>
                    <div className="font-medium">ETH → USDC</div>
                    <div className="text-sm text-muted">2 hours ago</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">+1,245.50 USDC</div>
                  <div className="text-sm text-muted">0.5 ETH</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[hsl(var(--pink))]" />
                  <div>
                    <div className="font-medium">USDC → DAI</div>
                    <div className="text-sm text-muted">5 hours ago</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">+998.75 DAI</div>
                  <div className="text-sm text-muted">1,000 USDC</div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white" />
                  <div>
                    <div className="font-medium">ETH → WBTC</div>
                    <div className="text-sm text-muted">1 day ago</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">+0.0245 WBTC</div>
                  <div className="text-sm text-muted">1.0 ETH</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
