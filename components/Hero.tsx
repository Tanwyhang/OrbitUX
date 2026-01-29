'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function Hero() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1680, height: 1080 })
  const router = useRouter()

  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      const targetWidth = 1680
      const targetHeight = 1080
      
      const widthScale = Math.min(viewportWidth / targetWidth, 1)
      
      const scaledWidth = Math.floor(viewportWidth)
      const scaledHeight = Math.floor(targetHeight * widthScale)
      
      setDimensions({ width: scaledWidth, height: scaledHeight })

      if (iframeRef.current) {
        iframeRef.current.width = scaledWidth.toString()
        iframeRef.current.height = scaledHeight.toString()
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'NAVIGATE_TO_SWAP') {
        router.push('/swap')
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    window.addEventListener('message', handleMessage)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('message', handleMessage)
    }
  }, [router])

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black flex items-center justify-center">
      <iframe
        ref={iframeRef}
        src="/index.html"
        width={dimensions.width}
        height={dimensions.height}
        style={{ maxWidth: '100vw', maxHeight: '100vh' }}
        className="border-0"
        scrolling="no"
        title="OrbitUX Framer Site"
      />
    </div>
  )
}
