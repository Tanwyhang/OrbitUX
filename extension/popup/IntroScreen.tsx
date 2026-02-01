// Extension Intro Screen - PointCloudGlobe Animation
import React, { useEffect, useState, useRef } from 'react'

const IntroScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [opacity, setOpacity] = useState(1)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    // Start fade out after 1.6 seconds
    const fadeTimer = setTimeout(() => {
      setOpacity(0)
    }, 1600)

    // Call onComplete after animation finishes (2.1 seconds total)
    const completeTimer = setTimeout(() => {
      onComplete()
    }, 2100)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match popup
    const container = canvas.parentElement
    if (!container) return

    canvas.width = 380
    canvas.height = 600

    // Particle settings
    const particleCount = 1200
    const particles: {
      x: number
      y: number
      z: number
      originX: number
      originY: number
      originZ: number
      vx: number
      vy: number
      vz: number
    }[] = []

    // Initialize particles in a sphere
    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / particleCount)
      const theta = Math.sqrt(particleCount * Math.PI) * phi
      const radius = 90

      const x = radius * Math.cos(theta) * Math.sin(phi)
      const y = radius * Math.sin(theta) * Math.sin(phi)
      const z = radius * Math.cos(phi)

      // Start scattered (further out)
      const scatterMultiplier = 2.5 + Math.random() * 1

      particles.push({
        x: x * scatterMultiplier,
        y: y * scatterMultiplier,
        z: z * scatterMultiplier,
        originX: x,
        originY: y,
        originZ: z,
        vx: 0,
        vy: 0,
        vz: 0,
      })
    }

    let rotationY = 0
    let startTime = Date.now()

    const animate = () => {
      // Black background
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const elapsed = (Date.now() - startTime) / 1000

      // Draw logo text with fade in
      const textOpacity = Math.min(elapsed / 0.5, 1)
      ctx.font = 'bold 36px Doto, sans-serif'
      ctx.fillStyle = `rgba(255, 118, 168, ${textOpacity})`
      ctx.textAlign = 'center'
      ctx.fillText('ORBIT', canvas.width / 2, canvas.height / 2 + 180)

      ctx.font = 'bold 14px Doto, sans-serif'
      ctx.fillStyle = `rgba(255, 255, 255, ${textOpacity * 0.5})`
      ctx.fillText('Powered by RAILGUN', canvas.width / 2, canvas.height / 2 + 210)

      rotationY += 0.006

      // Sort particles by z for proper depth
      particles.sort((a, b) => a.z - b.z)

      // Update and draw particles
      particles.forEach((particle) => {
        // Move towards origin with easing
        const dx = particle.originX - particle.x
        const dy = particle.originY - particle.y
        const dz = particle.originZ - particle.z

        particle.vx += dx * 0.025
        particle.vy += dy * 0.025
        particle.vz += dz * 0.025

        particle.vx *= 0.9
        particle.vy *= 0.9
        particle.vz *= 0.9

        particle.x += particle.vx
        particle.y += particle.vy
        particle.z += particle.vz

        // Rotate around Y axis
        const cosY = Math.cos(rotationY)
        const sinY = Math.sin(rotationY)

        const rotatedX = particle.x * cosY - particle.z * sinY
        const rotatedZ = particle.x * sinY + particle.z * cosY

        // Project to 2D
        const fov = 350
        const scale = fov / (fov + rotatedZ)
        const projectedX = rotatedX * scale + canvas.width / 2
        const projectedY = particle.y * scale + canvas.height / 2

        // Draw particle
        const alpha = Math.max(0.1, Math.min(1, (rotatedZ + 200) / 400))
        const size = Math.max(0.8, scale * 2.5)

        // Pink color for particles
        const pinkIntensity = Math.max(0, (rotatedZ + 100) / 300)
        const r = 255
        const g = Math.floor(118 + (209 - 118) * (1 - pinkIntensity))
        const b = Math.floor(168 + (220 - 168) * (1 - pinkIntensity))

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`
        ctx.beginPath()
        ctx.arc(projectedX, projectedY, size, 0, Math.PI * 2)
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '380px',
        height: '600px',
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transition: 'opacity 0.5s ease-out',
        zIndex: 9999,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}

export default IntroScreen
