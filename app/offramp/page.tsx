'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function OfframpPage() {
  const router = useRouter()
  const [step, setStep] = useState<'pin' | 'loading' | 'success'>('pin')
  const [pin, setPin] = useState(['', '', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(5)
  const [loadingMessage, setLoadingMessage] = useState('Matching in progress')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const messages = [
    'Matching in progress',
    'Payment in progress',
    'Securing a match',
    'Finalizing connection',
    'Hang tight, we\'re on it',
    'Almost ready to complete',
    'Just a moment — finishing up',
  ]

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.join('').length === 6) {
      setStep('loading')
      // Start 5 second countdown with message cycling
      let count = 5
      setCountdown(count)

      const countdownTimer = setInterval(() => {
        count -= 1
        setCountdown(count)

        // Update loading message based on countdown (cycle through all 7 messages)
        const messageIndex = Math.min(5 - count, 6)
        setLoadingMessage(messages[messageIndex])

        if (count === 0) {
          clearInterval(countdownTimer)
          setStep('success')
        }
      }, 1000)
    }
  }

  const handlePinChange = (index: number, value: string) => {
    const newPin = [...pin]
    newPin[index] = value

    // Move to next box if value was entered
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    } else if (value && index === 5) {
      // Last digit entered, blur all inputs
      inputRefs.current[index]?.blur()
    }

    setPin(newPin)
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        // Move to previous box and clear it
        const newPin = [...pin]
        newPin[index - 1] = ''
        setPin(newPin)
        inputRefs.current[index - 1]?.focus()
      } else if (pin[index]) {
        // Clear current box
        const newPin = [...pin]
        newPin[index] = ''
        setPin(newPin)
      }
      e.preventDefault()
    }
  }

  const handleBoxClick = (index: number) => {
    // Focus the clicked box
    inputRefs.current[index]?.focus()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black py-12">
      <div className="w-full max-w-md px-4">
        {/* PIN Entry Step */}
        {step === 'pin' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-16">
              <div className="mx-auto h-48 w-48 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden">
                <img src="/orbit-black.png" alt="Orbit" className="h-40 w-40 object-contain" />
              </div>
            </div>

            <h1 className="text-5xl font-bold text-white mb-4">-10 USDC</h1>
            <p className="text-gray-400 mb-16 text-lg">Enter your PIN to continue</p>

            <form onSubmit={handlePinSubmit} className="w-full space-y-12">
              <div className="flex justify-center gap-4">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input
                    key={index}
                    ref={el => { inputRefs.current[index] = el }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={pin[index]}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onClick={() => handleBoxClick(index)}
                    className={`h-20 w-14 rounded-xl bg-white/5 text-center text-3xl font-bold text-white transition-all cursor-text ${
                      pin.join('').length === 6
                        ? 'border-2 border-[hsl(var(--pink))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--pink))] focus:ring-offset-2'
                        : 'border-2 border-white/20 focus:border-[hsl(var(--pink))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--pink))] focus:ring-offset-2'
                    }`}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={pin.join('').length !== 6}
                className={`w-full rounded-xl px-6 py-5 text-lg font-semibold text-white transition-all ${
                  pin.join('').length === 6
                    ? 'bg-gradient-to-r from-[hsl(var(--pink))] to-purple-600 hover:opacity-90'
                    : 'bg-white/10 cursor-not-allowed opacity-50'
                }`}
              >
                Confirm
              </button>
            </form>

            <p className="mt-8 text-base text-gray-500">
              Enter 6-digit PIN to authorize transaction
            </p>
          </div>
        )}

        {/* Loading Step */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-16">
              <div className="relative h-48 w-48 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
                <div
                  className="absolute inset-0 rounded-full border-4 border-t-[hsl(var(--pink))] border-r-transparent border-b-transparent border-l-transparent animate-spin"
                  style={{ animationDuration: '1s' }}
                ></div>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-3">{loadingMessage}</h2>
            <p className="text-gray-400 text-lg">
              Processing Payment...
            </p>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-16">
              <div className="relative h-56 w-56 mx-auto">
                {/* Pulsing background */}
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse"></div>

                {/* Green circle with tick */}
                <div className="absolute inset-3 rounded-full bg-green-500 flex items-center justify-center shadow-2xl shadow-green-500/50">
                  <svg className="w-28 h-28 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                      className="animate-draw"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <h2 className="text-5xl font-bold text-white mb-6">Sent: 10 USDC</h2>

            <div className="space-y-4 mb-8">
              <a
                href="https://basescan.org/tx/0x7f2e8b9a3c1d4f6e8a2b5c7d9e1f3a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 text-base text-gray-400 hover:text-[hsl(var(--pink))] transition-colors group"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="font-mono text-sm break-all">
                  0x7f2e...e6f8
                </span>
                <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <button
              onClick={() => router.push('/')}
              className="inline-block rounded-lg bg-gradient-to-r from-[hsl(var(--pink))] to-purple-600 px-8 py-4 text-base font-medium text-white hover:opacity-90 transition-all"
            >
              Back to Home
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes draw {
          0% {
            stroke-dasharray: 50;
            stroke-dashoffset: 50;
          }
          100% {
            stroke-dasharray: 50;
            stroke-dashoffset: 0;
          }
        }
        .animate-draw {
          animation: draw 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}