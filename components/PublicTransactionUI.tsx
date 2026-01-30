'use client';

import { motion } from 'framer-motion';
import type { PublicTransferResult, PublicTransferProgress } from '@/hooks/usePublicTransfer';
import { EXPLORER_URL } from '@/lib/wagmi';

interface PublicTransactionProgressProps {
  progress: PublicTransferProgress;
}

export function PublicTransactionProgress({ progress }: PublicTransactionProgressProps) {
  const { step, progress: percent, message, details } = progress;

  const isError = step === 'error';
  const isComplete = step === 'complete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className={`text-lg font-semibold ${
              isError ? 'text-red-400' : 
              isComplete ? 'text-green-400' : 
              'text-white'
            }`}>
              {isError ? 'Transfer Failed' : isComplete ? 'Transfer Complete' : 'Processing...'}
            </h2>
            <span className={`text-sm font-mono ${
              isError ? 'text-red-400' : 
              isComplete ? 'text-green-400' : 
              'text-white/60'
            }`}>
              {percent}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                isError ? 'bg-red-500' : 
                isComplete ? 'bg-green-500' : 
                'bg-white'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Current Status */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10 mb-4">
          <div className="text-sm text-white">{message}</div>
          {details && (
            <div className="text-xs text-white/50 mt-1">{details}</div>
          )}
        </div>

        <div className="text-center text-xs text-white/40">
          Standard ERC20 transfer (no privacy)
        </div>
      </motion.div>
    </div>
  );
}

interface PublicTransactionResultProps {
  result: PublicTransferResult;
  onClose: () => void;
}

export function PublicTransactionResult({ result, onClose }: PublicTransactionResultProps) {
  const truncateAddress = (addr: string, chars: number = 6) => {
    if (!addr || addr.length <= chars * 2) return addr || '';
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  };

  if (!result.success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md mx-4 rounded-2xl border border-red-500/20 bg-black/90 p-6 backdrop-blur-xl"
        >
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2 text-red-400">Transfer Failed</h2>
            <p className="text-sm text-white/60 mb-6">{result.error}</p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-400 mb-1">Transfer Complete</h2>
          <p className="text-sm text-white/50">
            Standard ERC20 transfer
          </p>
        </div>

        {/* Transfer Flow */}
        <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-sm font-mono mb-3">
            <span className="text-white/70">{truncateAddress(result.senderAddress)}</span>
            <span className="text-white/30">--&gt;</span>
            <span className="text-white/70">{truncateAddress(result.recipientAddress)}</span>
          </div>
          <div className="text-center text-lg font-bold">
            {result.amount} {result.token}
          </div>
        </div>

        {/* Warning */}
        <div className="mb-6 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-200/80 text-center">
            Standard transfer - sender and recipient are publicly linked.
            Enable Stealth Mode for private transfers.
          </p>
        </div>

        {/* View on Explorer */}
        {result.txHash && (
          <a
            href={result.txLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 mb-4 text-center rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
          >
            View on Explorer
          </a>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
}
