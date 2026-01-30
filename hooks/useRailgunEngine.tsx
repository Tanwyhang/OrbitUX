'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

/**
 * RAILGUN Engine Context
 * 
 * Manages the RAILGUN engine initialization state.
 * The actual engine runs server-side via API routes.
 */

export type EngineStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

interface RailgunEngineState {
  status: EngineStatus;
  error: string | null;
  networkName: string;
  isNetworkReady: boolean;
}

interface RailgunEngineContextType extends RailgunEngineState {
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;
}

const RailgunEngineContext = createContext<RailgunEngineContextType | null>(null);

const NETWORK_NAME = 'Ethereum_Sepolia';

export function RailgunEngineProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<RailgunEngineState>({
    status: 'uninitialized',
    error: null,
    networkName: NETWORK_NAME,
    isNetworkReady: false,
  });

  const initialize = useCallback(async () => {
    if (state.status === 'ready' || state.status === 'initializing') {
      return;
    }

    setState(prev => ({ ...prev, status: 'initializing', error: null }));

    try {
      console.log('[RAILGUN Engine] Initializing via API...');
      
      const response = await fetch('/api/railgun/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize RAILGUN engine');
      }

      if (data.status === 'ready') {
        setState(prev => ({
          ...prev,
          status: 'ready',
          isNetworkReady: true,
          networkName: data.network || NETWORK_NAME,
        }));
        console.log('[RAILGUN Engine] Initialized successfully');
      } else if (data.status === 'error') {
        throw new Error(data.error || 'Engine initialization failed');
      } else {
        // Still initializing - poll for status
        setState(prev => ({
          ...prev,
          status: data.status,
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      console.error('[RAILGUN Engine] Initialization failed:', error);
    }
  }, [state.status]);

  const shutdown = useCallback(async () => {
    if (state.status !== 'ready') {
      return;
    }

    try {
      setState({
        status: 'uninitialized',
        error: null,
        networkName: NETWORK_NAME,
        isNetworkReady: false,
      });
      console.log('[RAILGUN Engine] Shutdown successfully');
    } catch (error) {
      console.error('[RAILGUN Engine] Shutdown error:', error);
    }
  }, [state.status]);

  // Check engine status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/railgun/init');
        const data = await response.json();
        
        if (data.status === 'ready') {
          setState(prev => ({
            ...prev,
            status: 'ready',
            isNetworkReady: true,
            networkName: data.network || NETWORK_NAME,
          }));
        }
      } catch (error) {
        // API not available yet - that's okay
        console.log('[RAILGUN Engine] Status check failed - API may not be ready');
      }
    };

    checkStatus();
  }, []);

  return (
    <RailgunEngineContext.Provider
      value={{
        ...state,
        initialize,
        shutdown,
      }}
    >
      {children}
    </RailgunEngineContext.Provider>
  );
}

export function useRailgunEngine() {
  const context = useContext(RailgunEngineContext);
  if (!context) {
    throw new Error('useRailgunEngine must be used within a RailgunEngineProvider');
  }
  return context;
}
