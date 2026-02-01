'use client'

import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

export default function FloatingNav({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname()

  return (
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center items-center pointer-events-none">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/80 backdrop-blur-md px-4 py-3 pointer-events-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.link
          return (
            <a
              key={item.link}
              href={item.link}
              className={`px-6 py-4 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-pink-200 text-black'
                  : 'text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {item.name}
            </a>
          )
        })}
      </div>
    </div>
  )
}

export interface NavItem {
  name: string
  link: string
}
