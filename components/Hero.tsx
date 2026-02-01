'use client'

import { useRouter } from 'next/navigation'
import PixelBlast from './PixelBlast'
import PointCloudGlobe from './PointCloudGlobe'
import { motion } from 'framer-motion'

export default function Hero() {
  const router = useRouter()

  const handleLaunchApp = () => {
    router.push('/card')
  }

  return (
    <div className="cursor-none">
      {/* PixelBlast Background */}
      <div className="fixed inset-0 w-full h-full bg-black" style={{ opacity: 0.55 }}>
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#ffffff"
          patternScale={2}
          patternDensity={0.25}
          pixelSizeJitter={0}
          enableRipples={true}
          rippleIntensityScale={1}
          rippleThickness={0.12}
          rippleSpeed={0.4}
          speed={7}
          edgeFade={0.25}
          liquid={false}
        />
      </div>

      {/* Hero Content */}
      <div className="fixed inset-0 z-10 flex flex-col items-center justify-center h-full px-8">
        <div className="flex flex-col items-center gap-10">
          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-4xl md:text-5xl text-white/90 text-center"
            style={{ fontFamily: 'var(--font-doto), sans-serif' }}
          >
            Orbit zkWormhole
          </motion.p>

          {/* Point Cloud Globe */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
            className="relative z-20"
          >
            <PointCloudGlobe />
            {/* Pixelated glow effect */}
            <div 
              className="absolute inset-0 blur-3xl opacity-20"
              style={{
                background: 'radial-gradient(ellipse at center, #ffffff 0%, transparent 70%)',
              }}
            />
          </motion.div>

          {/* Launch Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          >
            <button
              onClick={handleLaunchApp}
              className="group relative px-10 py-5 rounded-full bg-white text-black font-semibold text-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(177,158,239,0.5)] cursor-none"
              style={{ fontFamily: 'var(--font-doto), sans-serif' }}
            >
              Launch Orbit
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
