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

      // We need to derive the encryption key client-side for later use
      // (The API returns it but we'll also compute it here for signing)
      const encryptionKey = await deriveEncryptionKeyClientSide(password);

      const wallet: RailgunWalletInfo = {
        walletID: data.walletID,
        railgunAddress: data.railgunAddress,
        encryptionKey,
      };

      setState({
        status: 'ready',
        wallet,
        mnemonic,
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

/**
 * Derive encryption key client-side for use in transfer operations.
 * Must match the server-side derivation.
 */
async function deriveEncryptionKeyClientSide(password: string): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password);
  const passwordArray = Array.from(passwordBytes);
  const paddedArray = passwordArray
    .slice(0, 16)
    .concat(Array(Math.max(0, 16 - passwordArray.length)).fill(0));
  const saltHex = paddedArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  
  // Use Web Crypto API for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(saltHex),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useRailgunWallet() {
  const context = useContext(RailgunWalletContext);
  if (!context) {
    throw new Error('useRailgunWallet must be used within a RailgunWalletProvider');
  }
  return context;
}
