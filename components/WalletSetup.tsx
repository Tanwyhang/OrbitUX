'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Eye, EyeOff, Shield, AlertTriangle } from 'lucide-react';
import { useRailgunWallet } from '@/hooks/useRailgunWallet';

interface WalletSetupProps {
  onComplete: () => void;
}

export default function WalletSetup({ onComplete }: WalletSetupProps) {
  const { 
    status, 
    wallet, 
    mnemonic,
    error,
    generateMnemonic, 
    createWallet, 
    setMnemonic 
  } = useRailgunWallet();

  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [displayMnemonic, setDisplayMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Generate mnemonic on mount
  useEffect(() => {
    if (!displayMnemonic) {
      const newMnemonic = generateMnemonic();
      setDisplayMnemonic(newMnemonic);
    }
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateWallet = async () => {
    const mnemonicToUse = mode === 'generate' ? displayMnemonic : importMnemonic;
    
    if (!mnemonicToUse.trim()) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    if (password.length < 8) {
      return;
    }

    try {
      await createWallet(mnemonicToUse, password);
      onComplete();
    } catch (err) {
      console.error('Failed to create wallet:', err);
    }
  };

  const isValid = () => {
    const mnemonicToUse = mode === 'generate' ? displayMnemonic : importMnemonic;
    const wordCount = mnemonicToUse.trim().split(/\s+/).length;
    const validMnemonic = wordCount === 12 || wordCount === 24;
    const validPassword = password.length >= 8 && password === confirmPassword;
    const confirmedBackup = mode === 'import' || confirmed;
    
    return validMnemonic && validPassword && confirmedBackup;
  };

  const words = displayMnemonic.split(' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-[hsl(var(--pink))]/20">
            <Shield className="w-6 h-6 text-[hsl(var(--pink))]" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Setup Private Wallet</h2>
            <p className="text-sm text-white/60">Create or import your RAILGUN wallet</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('generate')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              mode === 'generate'
                ? 'bg-[hsl(var(--pink))] text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Generate New
          </button>
          <button
            onClick={() => setMode('import')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              mode === 'import'
                ? 'bg-[hsl(var(--pink))] text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Import Existing
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'generate' ? (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Warning */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200/80">
                  Write down these 12 words and store them safely. They are the only way to recover your private wallet.
                </p>
              </div>

              {/* Mnemonic Display */}
              <div className="relative mb-4">
                <div className="grid grid-cols-3 gap-2 p-4 rounded-lg bg-white/5 border border-white/10">
                  {words.map((word, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="text-white/40 w-4 text-right">{index + 1}.</span>
                      <span className={`font-mono ${showMnemonic ? '' : 'blur-sm'}`}>
                        {word}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    onClick={() => setShowMnemonic(!showMnemonic)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    title={showMnemonic ? 'Hide' : 'Show'}
                  >
                    {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5"
                />
                <span className="text-sm text-white/80">
                  I have written down my recovery phrase and stored it safely
                </span>
              </label>
            </motion.div>
          ) : (
            <motion.div
              key="import"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <textarea
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
                placeholder="Enter your 12 or 24 word recovery phrase..."
                className="w-full h-24 p-3 rounded-lg bg-white/5 border border-white/10 text-sm font-mono resize-none outline-none focus:border-[hsl(var(--pink))] mb-4"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Password Fields */}
        <div className="space-y-3 mb-6">
          <div>
            <label className="text-sm text-white/60 mb-1 block">Encryption Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-sm outline-none focus:border-[hsl(var(--pink))]"
            />
          </div>
          <div>
            <label className="text-sm text-white/60 mb-1 block">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-sm outline-none focus:border-[hsl(var(--pink))]"
            />
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Create Button */}
        <button
          onClick={handleCreateWallet}
          disabled={!isValid() || status === 'creating'}
          className="w-full py-3 rounded-xl bg-[hsl(var(--pink))] text-white font-semibold transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'creating' ? 'Creating Wallet...' : 'Create Private Wallet'}
        </button>

        {/* Wallet Created Success */}
        {wallet && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-sm text-green-400">
              Wallet created! Address: {wallet.railgunAddress.slice(0, 20)}...
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
