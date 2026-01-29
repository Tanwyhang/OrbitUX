'use client'

import { motion } from 'framer-motion'

export default function FloatingNav({ navItems }: { navItems: NavItem[] }) {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/80 backdrop-blur-md px-4 py-3">
        {navItems.map((item, index) => (
          <motion.a
            key={item.link}
            href={item.link}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="px-6 py-2.5 rounded-full text-sm font-medium text-muted hover:text-white hover:bg-white/5 transition-all duration-200 whitespace-nowrap"
          >
            {item.name}
          </motion.a>
        ))}
      </div>
    </motion.div>
  )
}

export interface NavItem {
  name: string
  link: string
}
