'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import FloatingNav, { NavItem } from './ui/floating-navbar'
import PixelBlast from './PixelBlast'

export default function MainAppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    { name: 'Swap', link: '/swap' },
    { name: 'zkWormhole', link: '/zkWormhole' },
    { name: 'Card', link: '/card' }
  ]

  return (
    <>
      <div className="fixed inset-0 w-full h-full -z-10">
        <PixelBlast
          variant="square"
          pixelSize={5}
          color="#ff87b3"
          patternScale={1}
          patternDensity={1}
          pixelSizeJitter={1.8}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={5}
          edgeFade={0.25}
          transparent
        />
      </div>
      
      <Link href="/" className="fixed top-4 left-6 z-50 flex items-center gap-2">
        <div className="h-16 w-16 rounded-lg bg-[hsl(var(--white))] flex items-center justify-center">
          <h4 className="text-[hsl(var(--black))]">Orbit</h4>
        </div>
      </Link>
      
      <FloatingNav navItems={navItems} />
      
      <div className="pt-20">
        {children}
      </div>
    </>
  )
}
