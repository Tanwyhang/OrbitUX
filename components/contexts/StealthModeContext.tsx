'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface StealthModeContextType {
  stealthMode: boolean
  setStealthMode: (value: boolean) => void
  toggleStealthMode: () => void
}

const StealthModeContext = createContext<StealthModeContextType | undefined>(undefined)

export function StealthModeProvider({ children }: { children: ReactNode }) {
  const [stealthMode, setStealthMode] = useState(false)

  const toggleStealthMode = () => setStealthMode(prev => !prev)

  return (
    <StealthModeContext.Provider value={{ stealthMode, setStealthMode, toggleStealthMode }}>
      {children}
    </StealthModeContext.Provider>
  )
}

export function useStealthMode() {
  const context = useContext(StealthModeContext)
  if (context === undefined) {
    throw new Error('useStealthMode must be used within a StealthModeProvider')
  }
  return context
}
