'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navigation() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Swap', href: '/swap' },
    { name: 'zkWormhole', href: '/zkWormhole' },
    { name: 'Card', href: '/card' }
  ]

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-3xl bg-black/50 border-b border-white/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/swap" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[hsl(var(--ring))] to-[hsl(var(--accent))] flex items-center justify-center">
            <span className="text-sm font-bold text-black">O</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">OrbitUX</span>
        </Link>

        <div className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/10 text-white ring-accent'
                    : 'text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.name}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
