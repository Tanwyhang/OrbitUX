'use client';

import { motion } from 'framer-motion';
import type { TransferResult } from '@/hooks/usePrivateTransfer';
import { useState } from 'react';
import { EXPLORER_URL } from '@/lib/wagmi';

interface TransactionResultProps {
  result: TransferResult;
  onClose: () => void;
}

export default function TransactionResult({ result, onClose }: TransactionResultProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const truncateAddress = (addr: string, chars: number = 8) => {
    if (!addr || addr.length <= chars * 2) return addr || '';
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  };

  const truncateHash = (hash: string) => {
    if (!hash) return '';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-400 mb-1">Transfer Complete</h2>
          <p className="text-sm text-white/50">
            Private transfer via RAILGUN - zero gas paid
          </p>
        </div>

        {/* Flow Diagram */}
        <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
          <div className="text-xs text-white/40 mb-3">PRIVACY FLOW</div>
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-white/70">{truncateAddress(result.senderInfo.publicAddress, 6)}</span>
            <span className="text-white/30">--&gt;</span>
            <span className="text-white/50">[RAILGUN]</span>
            <span className="text-white/30">--&gt;</span>
            <span className="text-white/70">{truncateAddress(result.recipientInfo.publicAddress, 6)}</span>
          </div>
          <div className="text-xs text-green-400/80 mt-2">
            No on-chain link between sender and recipient
          </div>
        </div>

        {/* Transactions */}
        <div className="space-y-3 mb-6">
          {/* Shield TX */}
          <div className="p-3 rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/60">1. Shield TX</span>
              <span className="text-xs text-green-400">confirmed</span>
            </div>
            <div className="text-xs text-white/40 mb-1">
              You → RAILGUN Contract
            </div>
            {result.shieldTxHash && (
              <div className="flex items-center gap-2">
                <a
                  href={`${EXPLORER_URL}/tx/${result.shieldTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-white/50 hover:text-white/70"
                >
                  {truncateHash(result.shieldTxHash)}
                </a>
                <button
                  onClick={() => handleCopy(result.shieldTxHash!, 'shield')}
                  className="text-xs text-white/30 hover:text-white/50"
                >
                  {copied === 'shield' ? 'copied' : 'copy'}
                </button>
              </div>
            )}
          </div>

          {/* Unshield TX */}
          <div className="p-3 rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/60">2. Unshield TX</span>
              <span className="text-xs text-green-400">confirmed</span>
            </div>
            <div className="text-xs text-white/40 mb-1">
              RAILGUN Contract → Recipient
            </div>
            {result.unshieldTxHash && (
              <div className="flex items-center gap-2">
                <a
                  href={`${EXPLORER_URL}/tx/${result.unshieldTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-white/50 hover:text-white/70"
                >
                  {truncateHash(result.unshieldTxHash)}
                </a>
                <button
                  onClick={() => handleCopy(result.unshieldTxHash!, 'unshield')}
                  className="text-xs text-white/30 hover:text-white/50"
                >
                  {copied === 'unshield' ? 'copied' : 'copy'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Observer View */}
        <div className="mb-6 p-4 rounded-lg border border-white/10 bg-white/5">
          <div className="text-xs text-white/40 mb-3">WHAT OBSERVERS SEE</div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-white/60 mb-1">Shield TX:</div>
              <div className="text-white/40">From: {truncateAddress(result.senderInfo.publicAddress, 6)}</div>
              <div className="text-white/40">To: RAILGUN</div>
              <div className="text-red-400/70 mt-1">Link to recipient: NONE</div>
            </div>
            <div>
              <div className="text-white/60 mb-1">Unshield TX:</div>
              <div className="text-white/40">From: RAILGUN</div>
              <div className="text-white/40">To: {truncateAddress(result.recipientInfo.publicAddress, 6)}</div>
              <div className="text-red-400/70 mt-1">Link to sender: NONE</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-4">
          {result.shieldTxHash && (
            <a
              href={`${EXPLORER_URL}/tx/${result.shieldTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 text-center text-sm rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              Shield TX
            </a>
          )}
          {result.unshieldTxHash && (
            <a
              href={`${EXPLORER_URL}/tx/${result.unshieldTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 text-center text-sm rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              Unshield TX
            </a>
          )}
        </div>

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
