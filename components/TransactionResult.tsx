'use client';

import { motion } from 'framer-motion';
import type { TransferResult } from '@/hooks/usePrivateTransfer';
import type { TokenShieldResult } from '@/lib/railgun/types';
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

  const truncateAddress = (addr: string, chars: number = 6) => {
    if (!addr || addr.length <= chars * 2) return addr || '';
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  };

  const truncateHash = (hash: string) => {
    if (!hash) return '';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  const isBatch = result.recipients && result.recipients.length > 1;
  const isMultiToken = result.shieldResults && result.shieldResults.length > 1;
  const totalAmount = result.recipients?.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0) || 0;

  if (!result.success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md mx-4 rounded-2xl border border-red-500/20 bg-black/90 p-6 backdrop-blur-xl"
        >
          <div>
            <h2 className="text-xl font-bold mb-2 text-red-400">Transfer Failed</h2>
            <p className="text-sm text-white/60 mb-4">{result.error}</p>
            
            {/* Show failed recipients if batch */}
            {result.recipients && result.recipients.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-xs text-white/40 mb-2">RECIPIENTS</div>
                <div className="space-y-1">
                  {result.recipients.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-white/60">{truncateAddress(r.address)}</span>
                      <span className="text-white/40">{r.amount} {r.token || 'USDC'}</span>
                      <span className="text-red-400">failed</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
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
          <h2 className="text-xl font-bold text-green-400 mb-1">
            {isBatch ? `Batch Transfer Complete` : 'Transfer Complete'}
          </h2>
          <p className="text-sm text-white/50">
            {isBatch 
              ? `${result.recipients?.length} recipients - zero gas paid`
              : 'Private transfer via RAILGUN - zero gas paid'
            }
          </p>
        </div>

        {/* Recipients List */}
        {result.recipients && result.recipients.length > 0 && (
          <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between text-xs text-white/40 mb-3">
              <span>RECIPIENTS</span>
              {isBatch && <span>Total: {totalAmount.toFixed(2)} USDC</span>}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {result.recipients.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-white/5">
                  <div className="flex-1">
                    <div className="font-mono text-sm text-white/80">
                      {truncateAddress(r.address)}
                    </div>
                    {r.unshieldTxHash && (
                      <a
                        href={`${EXPLORER_URL}/tx/${r.unshieldTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white/40 hover:text-white/60"
                      >
                        {truncateHash(r.unshieldTxHash)}
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-white/70">
                      {r.amount} {r.token || 'USDC'}
                    </div>
                    <div className={`text-xs ${
                      r.status === 'complete' ? 'text-green-400' : 
                      r.status === 'error' ? 'text-red-400' : 
                      'text-white/40'
                    }`}>
                      {r.status === 'complete' ? 'sent' : r.status || 'pending'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Privacy Flow */}
        <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
          <div className="text-xs text-white/40 mb-3">PRIVACY FLOW</div>
          <div className="text-sm font-mono text-center">
            <span className="text-white/70">{truncateAddress(result.senderInfo.publicAddress)}</span>
            <span className="text-white/30"> --&gt; </span>
            <span className="text-white/50">[RAILGUN]</span>
            <span className="text-white/30"> --&gt; </span>
            {isBatch ? (
              <span className="text-white/70">{result.recipients?.length} addresses</span>
            ) : (
              <span className="text-white/70">{truncateAddress(result.recipientInfo.publicAddress)}</span>
            )}
          </div>
          <div className="text-xs text-green-400/80 mt-2 text-center">
            No on-chain link between sender and recipient{isBatch ? 's' : ''}
          </div>
        </div>

        {/* Transactions */}
        <div className="space-y-2 mb-6">
          {/* Multi-token shield transactions */}
          {isMultiToken && result.shieldResults ? (
            <>
              <div className="text-xs text-white/40 mb-1">SHIELD TRANSACTIONS ({result.shieldResults.length} tokens)</div>
              {result.shieldResults.map((sr, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                  <div>
                    <div className="text-sm text-white/60">Shield TX #{i + 1}</div>
                    <div className="text-xs text-white/40 font-mono">
                      {truncateAddress(sr.tokenAddress)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`${EXPLORER_URL}/tx/${sr.shieldTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-white/50 hover:text-white/70"
                    >
                      {truncateHash(sr.shieldTxHash)}
                    </a>
                    <button
                      onClick={() => handleCopy(sr.shieldTxHash, `shield-${i}`)}
                      className="text-xs text-white/30 hover:text-white/50"
                    >
                      {copied === `shield-${i}` ? 'ok' : 'copy'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : result.shieldTxHash && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
              <div>
                <div className="text-sm text-white/60">Shield TX</div>
                <div className="text-xs text-white/40">You --&gt; RAILGUN</div>
              </div>
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
                  {copied === 'shield' ? 'ok' : 'copy'}
                </button>
              </div>
            </div>
          )}
          
          {result.unshieldTxHash && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
              <div>
                <div className="text-sm text-white/60">Unshield TX</div>
                <div className="text-xs text-white/40">
                  RAILGUN --&gt; {isBatch ? `${result.recipients?.length} recipients` : 'Recipient'}
                </div>
              </div>
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
                  {copied === 'unshield' ? 'ok' : 'copy'}
                </button>
              </div>
            </div>
          )}
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
