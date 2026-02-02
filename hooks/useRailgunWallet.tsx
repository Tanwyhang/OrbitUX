'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Mnemonic, randomBytes, keccak256, toUtf8Bytes } from 'ethers';
import { useRailgunEngine } from './useRailgunEngine';

/**
 * RAILGUN Wallet Context
 * 
 * Manages RAILGUN wallet creation and state.
 * Creates wallets server-side via API routes.
 */

export interface RailgunWalletInfo {
  walletID: string;
  railgunAddress: string; // 0zk... address
  encryptionKey: string;
}

export type WalletStatus = 'none' | 'creating' | 'ready' | 'error';

interface RailgunWalletState {
  status: WalletStatus;
  wallet: RailgunWalletInfo | null;
  mnemonic: string | null;
  password: string | null;
  error: string | null;
}

interface RailgunWalletContextType extends RailgunWalletState {
  generateMnemonic: () => string;
  createWallet: (mnemonic: string, password: string) => Promise<RailgunWalletInfo>;
  clearWallet: () => void;
  setMnemonic: (mnemonic: string) => void;
}

const RailgunWalletContext = createContext<RailgunWalletContextType | null>(null);

export function RailgunWalletProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { status: engineStatus, initialize: initEngine } = useRailgunEngine();
  
  const [state, setState] = useState<RailgunWalletState>({
    status: 'none',
    wallet: null,
    mnemonic: null,
    password: null,
    error: null,
  });

  const generateMnemonic = useCallback((): string => {
    // Generate 12-word mnemonic from 16 bytes of entropy
    const entropy = randomBytes(16);
    const mnemonic = Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }, []);

  const setMnemonic = useCallback((mnemonic: string) => {
    setState(prev => ({ ...prev, mnemonic }));
  }, []);

  const createWallet = useCallback(async (mnemonic: string, password: string): Promise<RailgunWalletInfo> => {
    setState(prev => ({ ...prev, status: 'creating', error: null }));

    try {
      // Validate mnemonic
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        throw new Error(`Invalid mnemonic: expected 12 or 24 words, got ${wordCount}`);
      }

      // Ensure engine is initialized
      if (engineStatus !== 'ready') {
        console.log('[RAILGUN Wallet] Initializing engine first...');
        await initEngine();
      }

      // Create wallet via API
      console.log('[RAILGUN Wallet] Creating wallet via API...');
      
      const response = await fetch('/api/railgun/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mnemonic, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create wallet');
      }

      // Use the server-derived encryption key
      // IMPORTANT: Do not derive client-side - the server uses RAILGUN SDK's pbkdf2
      // which has different salt encoding than Web Crypto API
      if (!data.encryptionKey) {
        throw new Error('Server did not return encryption key');
      }

      const wallet: RailgunWalletInfo = {
        walletID: data.walletID,
        railgunAddress: data.railgunAddress,
        encryptionKey: data.encryptionKey,
      };

      setState({
        status: 'ready',
        wallet,
        mnemonic,
        password,
        error: null,
      });

      console.log('[RAILGUN Wallet] Created successfully');
      console.log('[RAILGUN Wallet] Address:', wallet.railgunAddress.slice(0, 30) + '...');

      return wallet;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create wallet';
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      throw error;
    }
  }, [engineStatus, initEngine]);

  const clearWallet = useCallback(() => {
    setState({
      status: 'none',
      wallet: null,
      mnemonic: null,
      password: null,
      error: null,
    });
  }, []);

  return (
    <RailgunWalletContext.Provider
      value={{
        ...state,
        generateMnemonic,
        createWallet,
        clearWallet,
        setMnemonic,
      }}
    >
      {children}
    </RailgunWalletContext.Provider>
  );
}

export function useRailgunWallet() {
  const context = useContext(RailgunWalletContext);
  if (!context) {
    throw new Error('useRailgunWallet must be used within a RailgunWalletProvider');
  }
  return context;
}
