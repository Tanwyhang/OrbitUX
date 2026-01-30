'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useZkp2pOnramp } from '@/hooks/useZkp2pOnramp'
import { Suspense } from 'react'

function OnrampTrigger() {
  const { openOnramp } = useZkp2pOnramp()
  const searchParams = useSearchParams()

  useEffect(() => {
    const triggerOnramp = async () => {
      try {
        await openOnramp({
          toToken: '137:0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          paymentPlatform: 'wise',
          inputAmount: 10,
        })
        // Close the tab after triggering onramp (small delay to ensure side panel opens)
        setTimeout(() => {
          window.close()
        }, 1000)
      } catch (err) {
        console.error('Failed to open onramp:', err)
        // Show error and close
        setTimeout(() => {
          window.close()
        }, 3000)
      }
    }

    triggerOnramp()
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
        <p>Opening onramp...</p>
      </div>
    </div>
  )
}

export default function OnrampPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-black text-white">Loading...</div>}>
      <OnrampTrigger />
    </Suspense>
  )
}
