'use client'

import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import * as THREE from 'three'

function PointCloudSphere({ containerRef, onGlobeHover }: { containerRef: React.RefObject<HTMLDivElement | null>, onGlobeHover: (isHovering: boolean) => void }) {
  const pointsRef = useRef<THREE.Points>(null)
  const { camera } = useThree()
  const mousePos = useRef(new THREE.Vector3(0, 0, 0))
  const currentPositions = useRef<Float32Array | null>(null)
  const startTime = useRef(0)
  
  const [positions, colors, scatteredPositions] = useMemo(() => {
    const particleCount = 2500
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const scatteredPositions = new Float32Array(particleCount * 3)
    
    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / particleCount)
      const theta = Math.sqrt(particleCount * Math.PI) * phi
      
      const radius = 1.8
      
      positions[i * 3] = radius * Math.cos(theta) * Math.sin(phi)
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi)
      positions[i * 3 + 2] = radius * Math.cos(phi)
      
      // Scattered positions - expand outward from globe position
      const scatterMultiplier = 3 + Math.random() * 1.5
      scatteredPositions[i * 3] = positions[i * 3] * scatterMultiplier
      scatteredPositions[i * 3 + 1] = positions[i * 3 + 1] * scatterMultiplier
      scatteredPositions[i * 3 + 2] = positions[i * 3 + 2] * scatterMultiplier
      
      colors[i * 3] = 1
      colors[i * 3 + 1] = 1
      colors[i * 3 + 2] = 1
    }
    
    return [positions, colors, scatteredPositions]
  }, [])
  
  const originalPositions = useMemo(() => new Float32Array(positions), [positions])
  
  useEffect(() => {
    // Initialize with scattered positions
    currentPositions.current = new Float32Array(scatteredPositions)
    startTime.current = performance.now()
  }, [scatteredPositions])
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      
      const vector = new THREE.Vector3(x, y, 0.5)
      vector.unproject(camera)
      const dir = vector.sub(camera.position).normalize()
      const distance = -camera.position.z / dir.z
      const pos = camera.position.clone().add(dir.multiplyScalar(distance))
      
      mousePos.current.set(pos.x, pos.y, 0)
      
      // Check if mouse is within globe radius
      const distFromCenter = Math.sqrt(pos.x * pos.x + pos.y * pos.y)
      onGlobeHover(distFromCenter < 2.2)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [camera, containerRef, onGlobeHover])
  
  useFrame((state, delta) => {
    if (pointsRef.current && currentPositions.current) {
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array
      const colors = pointsRef.current.geometry.attributes.color.array as Float32Array
      const repulsionRadius = 2.5
      const repulsionStrength = 5
      
      // Calculate intro animation progress (2 seconds)
      const elapsed = (performance.now() - startTime.current) / 1000
      const introProgress = Math.min(elapsed / 2, 1)
      const introEase = 1 - Math.pow(1 - introProgress, 3) // ease out cubic
      
      // Slower during intro, faster after
      const returnSpeed = introProgress < 1 ? 2 : 4
      
      const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(pointsRef.current.rotation)
      const inverseRotation = rotationMatrix.clone().invert()
      
      const localMouse = mousePos.current.clone().applyMatrix4(inverseRotation)
      
      // Pale pink color (RGB: 255, 209, 220) normalized
      const pinkR = 1
      const pinkG = 0.82
      const pinkB = 0.86
      
      for (let i = 0; i < positions.length / 3; i++) {
        const ix = i * 3
        const iy = i * 3 + 1
        const iz = i * 3 + 2
        
        const origX = originalPositions[ix]
        const origY = originalPositions[iy]
        const origZ = originalPositions[iz]
        
        const currX = currentPositions.current[ix]
        const currY = currentPositions.current[iy]
        const currZ = currentPositions.current[iz]
        
        const dx = currX - localMouse.x
        const dy = currY - localMouse.y
        const dz = currZ - localMouse.z
        const distToMouse = Math.sqrt(dx * dx + dy * dy + dz * dz)
        
        let targetX = origX
        let targetY = origY
        let targetZ = origZ
        let colorBlend = 0
        
        // Only apply mouse repulsion after intro is mostly done
        if (introProgress > 0.7 && distToMouse < repulsionRadius && distToMouse > 0.01) {
          const force = (1 - distToMouse / repulsionRadius) * repulsionStrength
          const normalizedDx = dx / distToMouse
          const normalizedDy = dy / distToMouse
          const normalizedDz = dz / distToMouse
          
          targetX = origX + normalizedDx * force
          targetY = origY + normalizedDy * force
          targetZ = origZ + normalizedDz * force
          
          // Color blend based on repulsion force
          colorBlend = (1 - distToMouse / repulsionRadius)
        }
        
        // Lerp colors: white to pale pink based on repulsion
        colors[ix] = 1 + (pinkR - 1) * colorBlend
        colors[iy] = 1 + (pinkG - 1) * colorBlend
        colors[iz] = 1 + (pinkB - 1) * colorBlend
        
        currentPositions.current[ix] += (targetX - currX) * returnSpeed * delta
        currentPositions.current[iy] += (targetY - currY) * returnSpeed * delta
        currentPositions.current[iz] += (targetZ - currZ) * returnSpeed * delta
        
        positions[ix] = currentPositions.current[ix]
        positions[iy] = currentPositions.current[iy]
        positions[iz] = currentPositions.current[iz]
      }
      
      pointsRef.current.geometry.attributes.position.needsUpdate = true
      pointsRef.current.geometry.attributes.color.needsUpdate = true
      
      const axis = new THREE.Vector3(1, 1, 0).normalize()
      pointsRef.current.rotateOnAxis(axis, 0.005)
    }
  })
  
  return (
    <Points ref={pointsRef} positions={scatteredPositions} colors={colors}>
      <PointMaterial
        transparent
        vertexColors
        size={0.08}
        sizeAttenuation={true}
        depthWrite={false}
      />
    </Points>
  )
}

export default function PointCloudGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOverGlobe, setIsOverGlobe] = useState(false)
  const cursorRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGPathElement>(null)
  const animationRef = useRef<number>(0)
  const targetPos = useRef({ x: 0, y: 0 })
  const currentPos = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const spikeOffsets = useRef<number[]>(Array(12).fill(0))
  const spikeVelocities = useRef<number[]>(Array(12).fill(0))
  
  const generateBlobPath = (radius: number, spikes: number[], center: number) => {
    const points = spikes.length
    const angleStep = (Math.PI * 2) / points
    
    let path = ''
    const coords: { x: number; y: number }[] = []
    
    for (let i = 0; i < points; i++) {
      const angle = i * angleStep - Math.PI / 2
      const r = radius + spikes[i]
      const x = center + Math.cos(angle) * r
      const y = center + Math.sin(angle) * r
      coords.push({ x, y })
    }
    
    // Create smooth curve through points
    path = `M ${coords[0].x} ${coords[0].y}`
    
    for (let i = 0; i < points; i++) {
      const curr = coords[i]
      const next = coords[(i + 1) % points]
      const nextNext = coords[(i + 2) % points]
      
      const cpX = next.x + (nextNext.x - curr.x) * 0.15
      const cpY = next.y + (nextNext.y - curr.y) * 0.15
      
      path += ` Q ${next.x} ${next.y} ${(next.x + nextNext.x) / 2} ${(next.y + nextNext.y) / 2}`
    }
    
    path += ' Z'
    return path
  }
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      targetPos.current = { x: e.clientX, y: e.clientY }
    }
    
    const animate = () => {
      const isStable = isOverGlobe
      
      if (isStable) {
        // Stable: follow cursor directly
        currentPos.current.x = targetPos.current.x
        currentPos.current.y = targetPos.current.y
        
        // Smooth spikes back to 0
        for (let i = 0; i < spikeOffsets.current.length; i++) {
          spikeOffsets.current[i] *= 0.85
          spikeVelocities.current[i] *= 0.5
        }
      } else {
        // Chaotic: springy physics with jitter
        const springStrength = 0.08
        const damping = 0.75
        const jitter = 3
        
        const dx = targetPos.current.x - currentPos.current.x
        const dy = targetPos.current.y - currentPos.current.y
        
        velocity.current.x += dx * springStrength
        velocity.current.y += dy * springStrength
        
        velocity.current.x *= damping
        velocity.current.y *= damping
        
        // Add random jitter
        velocity.current.x += (Math.random() - 0.5) * jitter
        velocity.current.y += (Math.random() - 0.5) * jitter
        
        currentPos.current.x += velocity.current.x
        currentPos.current.y += velocity.current.y
        
        // Update spike distortions
        for (let i = 0; i < spikeOffsets.current.length; i++) {
          // Random force towards new target
          const targetSpike = (Math.random() - 0.5) * 16
          spikeVelocities.current[i] += (targetSpike - spikeOffsets.current[i]) * 0.15
          spikeVelocities.current[i] *= 0.8
          spikeOffsets.current[i] += spikeVelocities.current[i]
        }
      }
      
      if (cursorRef.current) {
        cursorRef.current.style.left = `${currentPos.current.x}px`
        cursorRef.current.style.top = `${currentPos.current.y}px`
      }
      
      if (svgRef.current) {
        const baseRadius = isStable ? 10 : 16
        svgRef.current.setAttribute('d', generateBlobPath(baseRadius, spikeOffsets.current, 24))
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animationRef.current)
    }
  }, [isOverGlobe])
  
  return (
    <div ref={containerRef} className="w-screen h-[420px] md:h-[480px] lg:h-[560px] cursor-none">
      <Canvas camera={{ position: [0, 0, 7], fov: 45 }} dpr={[1, 2]}>
        <PointCloudSphere containerRef={containerRef} onGlobeHover={setIsOverGlobe} />
      </Canvas>
      
      {/* Custom cursor orb */}
      <div
        ref={cursorRef}
        className="pointer-events-none fixed z-50"
        style={{
          transform: 'translate(-50%, -50%)',
          willChange: 'left, top',
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" className="overflow-visible">
          <path
            ref={svgRef}
            d={generateBlobPath(10, Array(12).fill(0), 24)}
            fill="white"
            style={{
              filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.8))',
            }}
          />
        </svg>
      </div>
    </div>
  )
}
