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
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        {/* PIN Entry Step */}
        {step === 'pin' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-12 sm:mb-16">
              <div className="mx-auto h-40 w-40 sm:h-48 sm:w-48 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden">
                <img src="/orbit-black.png" alt="Orbit" className="h-32 w-32 sm:h-40 sm:w-40 object-contain" />
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 sm:mb-4">-10 USDC</h1>
            <p className="text-gray-400 mb-12 sm:mb-16 text-base sm:text-lg">Enter your PIN to continue</p>

            <form onSubmit={handlePinSubmit} className="w-full space-y-10 sm:space-y-12">
              <div className="flex justify-center gap-2 sm:gap-4">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input
                    key={index}
                    ref={el => { inputRefs.current[index] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={pin[index]}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onClick={() => handleBoxClick(index)}
                    className={`h-16 sm:h-20 w-12 sm:w-14 rounded-xl bg-white/5 text-center text-2xl sm:text-3xl font-bold text-white transition-all cursor-text ${
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
                className={`w-full rounded-xl border-2 px-6 py-4 sm:py-5 text-base sm:text-lg font-semibold transition-all ${
                  pin.join('').length === 6
                    ? 'bg-white border-[hsl(var(--pink))] text-[hsl(var(--pink))] hover:bg-[#ffd6e0]'
                    : 'bg-white/10 border-white/20 text-white/40 cursor-not-allowed opacity-50'
                }`}
              >
                Confirm
              </button>
            </form>
          </div>
        )}

        {/* Loading Step */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-12 sm:mb-16">
              <div className="relative h-40 w-40 sm:h-48 sm:w-48 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
                <div
                  className="absolute inset-0 rounded-full border-4 border-t-[hsl(var(--pink))] border-r-transparent border-b-transparent border-l-transparent animate-spin"
                  style={{ animationDuration: '1s' }}
                ></div>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 text-center">{loadingMessage}</h2>
            <p className="text-gray-400 text-base sm:text-lg text-center">
              Processing Payment...
            </p>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-12 sm:mb-16">
              <div className="relative h-48 w-48 sm:h-56 sm:w-56 mx-auto">
                {/* Pulsing background */}
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse"></div>

                {/* Green circle with tick */}
                <div className="absolute inset-3 rounded-full bg-green-500 flex items-center justify-center shadow-2xl shadow-green-500/50">
                  <svg className="w-24 h-24 sm:w-28 sm:h-28 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 sm:mb-6 text-center">Sent: 10 USDC</h2>

            <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8 w-full flex justify-center">
              <a
                href="https://basescan.org/tx/0x9619649297c6d01172b7eadf124061906ef1715ba63e06b5f5da7e0e52fbe438"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-400 hover:text-[hsl(var(--pink))] transition-colors group"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="font-mono text-xs sm:text-sm break-all">
                  0x9619...be438
                </span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <button
              onClick={() => router.push('/')}
              className="inline-block rounded-lg border-2 border-[hsl(var(--pink))] bg-white px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base font-bold text-[hsl(var(--pink))] hover:bg-[#ffd6e0] transition-all"
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