'use client'

import { useCallback, useState } from 'react'
import { peerExtensionSdk, type PeerExtensionState } from '@zkp2p/sdk'

interface OnrampParams {
  referrer?: string
  referrerLogo?: string
  callbackUrl?: string
  inputCurrency?: string
  inputAmount?: string | number
  paymentPlatform?: string
  amountUsdc?: string | number
  toToken?: string
  recipientAddress?: string
}

interface UseZkp2pOnrampReturn {
  openOnramp: (params?: OnrampParams) => Promise<void>
  state: PeerExtensionState | null
  isLoading: boolean
  error: string | null
}

/**
 * Hook for integrating ZKP2P onramp functionality
 * Handles Peer extension state checking, installation, and onramp flow
 */
export function useZkp2pOnramp(
  defaultParams?: OnrampParams
): UseZkp2pOnrampReturn {
  const [state, setState] = useState<PeerExtensionState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openOnramp = useCallback(
    async (params?: OnrampParams) => {
      setIsLoading(true)
      setError(null)

      try {
        // Check if extension is available first
        if (!peerExtensionSdk.isAvailable()) {
          peerExtensionSdk.openInstallPage()
          throw new Error('Peer extension not detected. Please:\n1. Install the Peer extension from Chrome Web Store\n2. Pin it to your toolbar\n3. Click the extension icon to activate it on this page\n4. Refresh and try again')
        }

        // Check extension state
        const currentState = await peerExtensionSdk.getState()
        setState(currentState)

        if (currentState === 'needs_install') {
          // Open Chrome Web Store for installation
          peerExtensionSdk.openInstallPage()
          throw new Error('Peer extension not installed. Please install the extension first.')
        }

        if (currentState === 'needs_connection') {
          // Request connection
          const approved = await peerExtensionSdk.requestConnection()
          if (!approved) {
            throw new Error('Peer connection not approved. Please approve the connection.')
          }
          setState('ready')
        }

        // Merge default params with provided params
        const finalParams = {
          referrer: 'Orbit',
          referrerLogo: typeof window !== 'undefined' ? window.location.origin + '/orbit.png' : undefined,
          callbackUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
          ...defaultParams,
          ...params,
        }

        // Open onramp side panel
        peerExtensionSdk.onramp(finalParams)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open onramp')
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [defaultParams]
  )

  return {
    openOnramp,
    state,
    isLoading,
    error,
  }
}
