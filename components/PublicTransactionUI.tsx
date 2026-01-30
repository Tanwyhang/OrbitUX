'use client';

import { motion } from 'framer-motion';
import { ExternalLink, Check, X, ArrowRight, Loader2 } from 'lucide-react';
import type { PublicTransferResult, PublicTransferProgress } from '@/hooks/usePublicTransfer';
import { EXPLORER_URL } from '@/lib/wagmi';

interface PublicTransactionProgressProps {
  progress: PublicTransferProgress;
}

export function PublicTransactionProgress({ progress }: PublicTransactionProgressProps) {
  const { step, progress: percent, message, details } = progress;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-4">
            {step === 'complete' ? (
              <Check className="w-8 h-8 text-green-400" />
            ) : step === 'error' ? (
              <X className="w-8 h-8 text-red-400" />
            ) : (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-8 h-8 text-white" />
              </motion.div>
            )}
          </div>
          <h2 className="text-xl font-bold mb-1">{message}</h2>
          {details && (
            <p className="text-sm text-white/60">{details}</p>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-white/60 mb-2">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                step === 'error' ? 'bg-red-500' : 
                step === 'complete' ? 'bg-green-500' : 
                'bg-white'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <p className="text-center text-sm text-white/50">
          Standard ERC20 transfer (no privacy)
        </p>
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
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-4">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Transfer Failed</h2>
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
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-1">Transfer Complete!</h2>
          <p className="text-sm text-white/60">
            Standard ERC20 transfer completed
          </p>
        </div>

        {/* Transfer Flow */}
        <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <div className="flex-1 text-center p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">From</div>
              <div className="font-mono text-xs">
                {truncateAddress(result.senderAddress)}
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-white/30 flex-shrink-0" />

            <div className="flex-1 text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="text-xs text-white/50 mb-1">To</div>
              <div className="font-mono text-xs">
                {truncateAddress(result.recipientAddress)}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <div className="text-lg font-bold">
              {result.amount} {result.token}
            </div>
          </div>
        </div>

        {/* Warning about public transaction */}
        <div className="mb-6 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-200 text-center">
            This was a standard transfer. Sender and recipient are publicly linked on-chain.
            Enable Stealth Mode for private transfers.
          </p>
        </div>

        {/* View on Explorer */}
        {result.txHash && (
          <a
            href={result.txLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 mb-4 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
          >
            View on Explorer
            <ExternalLink className="w-4 h-4" />
          </a>
        )}

        {/* Close Button */}
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
