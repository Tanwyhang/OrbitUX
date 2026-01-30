'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import FloatingNav, { NavItem } from './ui/floating-navbar'
import PixelBlast from './PixelBlast'
import { Web3Provider } from './providers/Web3Provider'
import { StealthModeProvider, useStealthMode } from './contexts/StealthModeContext'

function MainAppLayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isZkWormhole = pathname === '/zkWormhole'
  const { stealthMode } = useStealthMode()
  
  // Show PixelBlast at 0.8 opacity on all pages except zkWormhole
  // On zkWormhole, the opacity is controlled separately by stealth mode
  const pixelBlastOpacity = isZkWormhole 
    ? (stealthMode ? 0.85 : 0) 
    : 0.8

  const navItems: NavItem[] = [
    { name: 'Swap', link: '/swap' },
    { name: 'zkWormhole', link: '/zkWormhole' },
    { name: 'Card', link: '/card' }
  ]

  return (
    <>
      <div 
        className="fixed inset-0 w-full h-full -z-10 bg-black transition-opacity duration-500 ease-in-out"
        style={{ opacity: pixelBlastOpacity }}
      >
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#ff76a8"
          patternScale={2}
          patternDensity={0.8}
          pixelSizeJitter={1}
          enableRipples
          speed={7}
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1}
          edgeFade={0.25}
        />
      </div>
      
      <Link href="/" className="fixed top-4 left-6 z-50 flex items-center gap-2">
        <div className="h-16 w-16 rounded-lg bg-[hsl(var(--white))] flex items-center justify-center">
          <h4 className="text-[hsl(var(--black))]">Orbit</h4>
        </div>
      </Link>

      {/* Wallet Connect Button */}
      <div className="fixed top-4 right-6 z-50">
        <ConnectButton 
          showBalance={false}
          chainStatus="icon"
          accountStatus={{
            smallScreen: 'avatar',
            largeScreen: 'full',
          }}
        />
      </div>
      
      <FloatingNav navItems={navItems} />
      
      <div className="pt-20">
        {children}
      </div>
    </>
  )
}

export default function MainAppLayout({ children }: { children: ReactNode }) {
  return (
    <Web3Provider>
      <StealthModeProvider>
        <MainAppLayoutContent>{children}</MainAppLayoutContent>
      </StealthModeProvider>
    </Web3Provider>
  )
}
