'use client';

import { motion } from 'framer-motion';
import { ExternalLink, Check, Shield, Eye, EyeOff, Copy, X, ArrowRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-1">Private Transfer Complete!</h2>
          <p className="text-sm text-white/60">
            Your tokens were transferred privately through RAILGUN
          </p>
        </div>

        {/* Privacy Flow Visualization */}
        <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
          <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[hsl(var(--pink))]" />
            Privacy Flow
          </h3>
          
          <div className="flex items-center justify-between gap-2 text-sm">
            {/* Sender */}
            <div className="flex-1 text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <EyeOff className="w-5 h-5 mx-auto mb-2 text-blue-400" />
              <div className="text-xs text-white/50 mb-1">Your Wallet</div>
              <div className="font-mono text-xs">
                {truncateAddress(result.senderInfo.publicAddress, 6)}
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-white/30 flex-shrink-0" />

            {/* RAILGUN */}
            <div className="flex-1 text-center p-3 rounded-lg bg-[hsl(var(--pink))]/10 border border-[hsl(var(--pink))]/20">
              <Shield className="w-5 h-5 mx-auto mb-2 text-[hsl(var(--pink))]" />
              <div className="text-xs text-white/50 mb-1">RAILGUN</div>
              <div className="text-xs text-[hsl(var(--pink))]">
                Private Pool
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-white/30 flex-shrink-0" />

            {/* Recipient */}
            <div className="flex-1 text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <Eye className="w-5 h-5 mx-auto mb-2 text-green-400" />
              <div className="text-xs text-white/50 mb-1">Recipient</div>
              <div className="font-mono text-xs">
                {truncateAddress(result.recipientInfo.publicAddress, 6)}
              </div>
            </div>
          </div>
        </div>

        {/* Two Transactions */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Shield TX */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-blue-500/20">
                <EyeOff className="w-4 h-4 text-blue-400" />
              </div>
              <span className="font-medium text-sm">Shield Transaction</span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-white/50">From:</span>
                <div className="font-mono text-xs mt-1">
                  {truncateAddress(result.senderInfo.publicAddress)}
                </div>
              </div>
              <div>
                <span className="text-white/50">To:</span>
                <div className="text-xs mt-1 text-[hsl(var(--pink))]">
                  RAILGUN Contract
                </div>
              </div>
              {result.shieldTxHash && (
                <a
                  href={`${EXPLORER_URL}/tx/${result.shieldTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
                >
                  {truncateHash(result.shieldTxHash)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Unshield TX */}
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-green-500/20">
                <Eye className="w-4 h-4 text-green-400" />
              </div>
              <span className="font-medium text-sm">Unshield Transaction</span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-white/50">From:</span>
                <div className="text-xs mt-1 text-[hsl(var(--pink))]">
                  RAILGUN Contract
                </div>
              </div>
              <div>
                <span className="text-white/50">To:</span>
                <div className="font-mono text-xs mt-1">
                  {truncateAddress(result.recipientInfo.publicAddress)}
                </div>
              </div>
              {result.unshieldTxHash && (
                <a
                  href={`${EXPLORER_URL}/tx/${result.unshieldTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 mt-2"
                >
                  {truncateHash(result.unshieldTxHash)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Privacy Proof Explanation */}
        <div className="rounded-xl border border-[hsl(var(--pink))]/20 bg-[hsl(var(--pink))]/5 p-4 mb-6">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[hsl(var(--pink))]" />
            Why This Is Private
          </h4>
          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
            {result.privacyProof.explanation}
          </p>
        </div>

        {/* On-Chain Observer View */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-6">
          <h4 className="font-semibold text-sm mb-3">What Blockchain Observers See</h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="text-blue-400 font-medium">Shield TX:</div>
              <ul className="list-disc list-inside text-white/70 space-y-1 text-xs">
                <li>Sender: <span className="font-mono">{truncateAddress(result.senderInfo.publicAddress, 6)}</span></li>
                <li>Recipient: RAILGUN Contract</li>
                <li>Connection to recipient: <span className="text-red-400">NONE</span></li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-green-400 font-medium">Unshield TX:</div>
              <ul className="list-disc list-inside text-white/70 space-y-1 text-xs">
                <li>Sender: RAILGUN Contract</li>
                <li>Recipient: <span className="font-mono">{truncateAddress(result.recipientInfo.publicAddress, 6)}</span></li>
                <li>Connection to sender: <span className="text-red-400">NONE</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <p className="text-xs text-green-400 font-medium">
              No on-chain link between sender and recipient
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {result.shieldTxHash && (
            <a
              href={`${EXPLORER_URL}/tx/${result.shieldTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm hover:bg-blue-500/20 transition-colors"
            >
              View Shield TX
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {result.unshieldTxHash && (
            <a
              href={`${EXPLORER_URL}/tx/${result.unshieldTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm hover:bg-green-500/20 transition-colors"
            >
              View Unshield TX
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => {
              const text = `Shield: ${result.shieldTxHash}\nUnshield: ${result.unshieldTxHash}`;
              handleCopy(text, 'all-hashes');
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
          >
            {copied === 'all-hashes' ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy TX Hashes
              </>
            )}
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-[hsl(var(--pink))] text-white font-semibold hover:brightness-110 transition-all"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
}
