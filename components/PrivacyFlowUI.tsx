'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo, useRef } from 'react';
import type { TransferProgress, TransferRecipient, TransferResult } from '@/hooks/usePrivateTransfer';
import { EXPLORER_URL } from '@/lib/wagmi';

interface PrivacyFlowUIProps {
  isVisible: boolean;
  isTransferring: boolean;
  progress: TransferProgress;
  result: TransferResult | null;
  senderAddress: string;
  recipients: TransferRecipient[];
  totalAmount: string;
  token: string;
  onClose: () => void;
}

// Glitch characters for the cyberpunk effect
const GLITCH_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

// Get a random glitch character
const getGlitchChar = () => GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];

// Truncate address for display
const truncateAddress = (addr: string, chars: number = 6) => {
  if (!addr || addr.length <= chars * 2 + 3) return addr || '';
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
};

// Truncate hash for display
const truncateHash = (hash: string) => {
  if (!hash) return '';
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
};

// Map step to user-friendly message
const getStepMessage = (step: string, recipientCount: number, message?: string): string => {
  switch (step) {
    case 'idle': return 'Ready';
    case 'preparing': return 'Initializing...';
    case 'signing': 
    case 'signing_token': return 'Awaiting signature...';
    case 'approving': return 'Processing approval...';
    case 'shielding':
    case 'shielding_token': return 'Shielding tokens...';
    case 'waiting_poi': return 'POI verification...';
    case 'generating_proof': 
      // Use custom message if it doesn't contain ZK proof percentage (handled separately)
      if (message && !message.includes('ZK proof')) {
        return message;
      }
      return 'Generating ZK proof...';
    case 'transferring':
    case 'unshielding': return `Unshielding to ${recipientCount} recipient${recipientCount > 1 ? 's' : ''}...`;
    case 'complete': return 'Privacy preserved';
    case 'error': return 'Transfer failed';
    default: return message || 'Processing...';
  }
};

// Glitching text component
function GlitchText({ text, isActive }: { text: string; isActive: boolean }) {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    if (!isActive) {
      setDisplayText(text);
      return;
    }

    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const chars = text.split('');
        const glitchIndex = Math.floor(Math.random() * chars.length);
        chars[glitchIndex] = getGlitchChar();
        setDisplayText(chars.join(''));
        
        // Reset after brief moment
        setTimeout(() => setDisplayText(text), 50);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [text, isActive]);

  return <span>{displayText}</span>;
}

// RAILGUN Black Box Component with terminal-style logs
function RailgunBlackBox({ 
  stepMessage,
  shieldTxHash,
  isActive,
  isComplete,
  isError,
  currentRecipient,
  totalRecipients,
  zkProofProgress,
  logs,
}: { 
  stepMessage: string;
  shieldTxHash?: string;
  isActive: boolean;
  isComplete: boolean;
  isError: boolean;
  currentRecipient?: number;
  totalRecipients?: number;
  zkProofProgress?: number;
  logs: string[];
}) {
  // Pink during progress, cyan-green on success
  const borderColor = isError ? 'border-red-500/50' : isComplete ? 'border-cyan-500/50' : 'border-[hsl(var(--pink))]/30';
  const bgColor = isError ? 'bg-red-950/30' : isComplete ? 'bg-cyan-950/20' : 'bg-black/90';
  const headerColor = isComplete ? 'text-cyan-500/50' : 'text-[hsl(var(--pink))]/50';

  // Show recipient progress if processing multiple recipients
  const showRecipientProgress = totalRecipients && totalRecipients > 1 && currentRecipient !== undefined;

  // Auto-scroll ref
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div
      className={`relative rounded-lg border-2 ${borderColor} ${bgColor} overflow-hidden`}
    >
      {/* Header with RAILGUN text */}
      <div className="text-center py-2 border-b border-white/10">
        <div className={`font-mono text-xs ${headerColor} tracking-[0.3em]`}>
          {'░'.repeat(6)} <GlitchText text="RAILGUN" isActive={isActive} /> {'░'.repeat(6)}
        </div>
      </div>

      {/* Terminal-style log area */}
      <div className="h-32 overflow-y-auto p-3 font-mono text-xs space-y-1">
        {logs.map((log, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-start gap-2 ${
              i === logs.length - 1 
                ? isError ? 'text-red-400' : isComplete ? 'text-cyan-400' : 'text-[hsl(var(--pink))]'
                : 'text-white/50'
            }`}
          >
            <span className="text-white/30 select-none">›</span>
            <span className="break-all">{log}</span>
          </motion.div>
        ))}
        
        {/* Blinking cursor on last line when active */}
        {isActive && (
          <motion.div 
            className="flex items-center gap-2 text-[hsl(var(--pink))]"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <span className="text-white/30 select-none">›</span>
            <span>_</span>
          </motion.div>
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Footer with current status */}
      <div className={`px-3 py-2 border-t border-white/10 ${isComplete ? 'bg-cyan-500/5' : isError ? 'bg-red-500/5' : 'bg-white/5'}`}>
        <div className="flex items-center justify-between">
          <div className={`font-mono text-xs ${isError ? 'text-red-400' : isComplete ? 'text-cyan-400' : 'text-[hsl(var(--pink))]'}`}>
            {isComplete ? '✓ Complete' : isError ? '✗ Failed' : stepMessage}
            {showRecipientProgress && !isComplete && !isError && (
              <span className="ml-2 text-white/40">
                [{currentRecipient! + 1}/{totalRecipients}]
              </span>
            )}
            {zkProofProgress !== undefined && zkProofProgress > 0 && !isComplete && !isError && (
              <span className="ml-2 text-white/40">
                {Math.round(zkProofProgress)}%
              </span>
            )}
          </div>
          
          {/* Shield TX hash */}
          {shieldTxHash && (
            <a
              href={`${EXPLORER_URL}/tx/${shieldTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-mono text-xs transition-colors ${isComplete ? 'text-cyan-500/60 hover:text-cyan-400' : 'text-[hsl(var(--pink))]/60 hover:text-[hsl(var(--pink))]'}`}
            >
              {truncateHash(shieldTxHash)} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Receiver card component
function ReceiverCard({ 
  recipient, 
  token,
  isActive,
}: { 
  recipient: TransferRecipient;
  token: string;
  isActive: boolean;
}) {
  const status = recipient.status || 'pending';
  const isComplete = status === 'complete';
  const isError = status === 'error';
  const isProcessing = status === 'processing';

  const statusIcon = isComplete ? '✓' : isError ? '✗' : isProcessing ? '↻' : '⋯';
  const statusColor = isComplete ? 'text-cyan-400' : isError ? 'text-red-400' : isProcessing ? 'text-[hsl(var(--pink))]' : 'text-white/40';

  return (
    <motion.div
      className={`p-3 rounded-lg border ${
        isComplete ? 'border-cyan-500/30 bg-cyan-950/20' :
        isError ? 'border-red-500/30 bg-red-950/20' :
        isProcessing ? 'border-[hsl(var(--pink))]/30 bg-[hsl(var(--pink))]/5' :
        'border-white/10 bg-white/5'
      }`}
      initial={{ opacity: 0.5 }}
      animate={{ 
        opacity: 1,
        scale: isProcessing ? [1, 1.01, 1] : 1,
      }}
      transition={{ 
        scale: { duration: 1, repeat: isProcessing ? Infinity : 0 }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm text-white/80">
          {truncateAddress(recipient.address)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">
            {recipient.amount} {recipient.token || token}
          </span>
          <motion.span 
            className={`text-sm ${statusColor}`}
            animate={isProcessing ? { rotate: 360 } : {}}
            transition={{ duration: 1, repeat: isProcessing ? Infinity : 0, ease: 'linear' }}
          >
            {statusIcon}
          </motion.span>
        </div>
      </div>

      {/* TX hash when complete */}
      {recipient.unshieldTxHash && (
        <a
          href={`${EXPLORER_URL}/tx/${recipient.unshieldTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-1 font-mono text-xs text-cyan-500/60 hover:text-cyan-400 transition-colors"
        >
          {truncateHash(recipient.unshieldTxHash)} ↗
        </a>
      )}

      {/* Waiting message */}
      {!recipient.unshieldTxHash && !isComplete && !isError && (
        <div className="mt-1 font-mono text-xs text-white/30">
          {isProcessing ? 'sending...' : 'waiting...'}
        </div>
      )}

      {/* Error message */}
      {isError && recipient.error && (
        <div className="mt-1 font-mono text-xs text-red-400/70">
          {recipient.error}
        </div>
      )}
    </motion.div>
  );
}

// Arrow connector component
function ArrowConnector({ isActive, isComplete }: { isActive: boolean; isComplete: boolean }) {
  const colorClass = isComplete ? 'text-cyan-500/50' : 'text-[hsl(var(--pink))]/50';
  return (
    <div className="flex justify-center py-2">
      <motion.div
        className={`${colorClass} text-xl`}
        animate={isActive ? { 
          opacity: [0.5, 1, 0.5],
          y: [0, 2, 0],
        } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      >
        ▼
      </motion.div>
    </div>
  );
}

// Main component
export default function PrivacyFlowUI({
  isVisible,
  isTransferring,
  progress,
  result,
  senderAddress,
  recipients,
  totalAmount,
  token,
  onClose,
}: PrivacyFlowUIProps) {
  const step = progress.step;
  const isComplete = step === 'complete' || (result?.success === true);
  const isError = step === 'error' || (result?.success === false);
  const isActive = isTransferring && !isComplete && !isError;

  // Get shield TX hash from result or progress
  const shieldTxHash = result?.shieldTxHash || progress.shieldResults?.[0]?.shieldTxHash;

  // Merge recipients from progress and result for real-time updates
  const displayRecipients = useMemo(() => {
    if (result?.recipients && result.recipients.length > 0) {
      return result.recipients;
    }
    if (progress.recipients && progress.recipients.length > 0) {
      return progress.recipients;
    }
    return recipients;
  }, [result?.recipients, progress.recipients, recipients]);

  const stepMessage = getStepMessage(step, displayRecipients.length, progress.message);
  const isBatch = displayRecipients.length > 1;

  // Parse ZK proof progress from message (format: "ZK proof 1/2... 45%")
  const zkProofProgress = useMemo(() => {
    if (step !== 'generating_proof') return undefined;
    const message = progress.message || '';
    // Match patterns like "ZK proof 1/2... 45%" or "ZK proof 1/2... 45.5%"
    const match = message.match(/ZK proof.*?(\d+(?:\.\d+)?)\s*%/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }, [step, progress.message]);

  // Get current recipient index from message (format: "ZK proof 1/2...")
  const currentRecipientFromMessage = useMemo(() => {
    if (step !== 'generating_proof') return undefined;
    const message = progress.message || '';
    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      return parseInt(match[1], 10) - 1; // Convert to 0-indexed
    }
    return progress.currentRecipientIndex;
  }, [step, progress.message, progress.currentRecipientIndex]);

  // Build logs array from progress messages
  const [logs, setLogs] = useState<string[]>([]);
  const lastMessageRef = useRef<string>('');

  useEffect(() => {
    const message = progress.message;
    if (message && message !== lastMessageRef.current) {
      lastMessageRef.current = message;
      setLogs(prev => {
        // Don't add duplicate consecutive messages
        if (prev[prev.length - 1] === message) return prev;
        // Keep last 20 logs to prevent unbounded growth
        const newLogs = [...prev, message];
        return newLogs.slice(-20);
      });
    }
  }, [progress.message]);

  // Reset logs when transfer starts
  useEffect(() => {
    if (isTransferring && step === 'preparing') {
      setLogs([]);
      lastMessageRef.current = '';
    }
  }, [isTransferring, step]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black/95 p-6 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="mb-6">
            <h2 className={`text-lg font-bold font-mono ${
              isError ? 'text-red-400' : 
              isComplete ? 'text-green-400' : 
              'text-white'
            }`}>
              {isError ? 'Transfer Failed' : isComplete ? 'Private Transfer Complete' : 'Private Transfer'}
            </h2>
            <p className="text-sm text-white/50 font-mono">
              {isBatch ? `${displayRecipients.length} recipients` : '1 recipient'} • zero gas
            </p>
          </div>

          {/* === STEP 1: SENDER === */}
          <div className="p-4 rounded-lg border border-white/10 bg-white/5">
            <div className="text-xs text-white/40 font-mono mb-2">SENDER</div>
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm text-white/80">
                {truncateAddress(senderAddress)}
              </div>
              <div className="text-sm text-white/60">
                {totalAmount} {token}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <ArrowConnector isActive={isActive} isComplete={isComplete} />

          {/* === STEP 2: RAILGUN BLACK BOX === */}
          <RailgunBlackBox
            stepMessage={stepMessage}
            shieldTxHash={shieldTxHash}
            isActive={isActive}
            isComplete={isComplete}
            isError={isError}
            currentRecipient={currentRecipientFromMessage}
            totalRecipients={displayRecipients.length}
            zkProofProgress={zkProofProgress}
            logs={logs}
          />

          {/* Arrow */}
          <ArrowConnector isActive={isActive} isComplete={isComplete} />

          {/* === STEP 3: RECEIVERS === */}
          <div className="p-4 rounded-lg border border-white/10 bg-white/5">
            <div className="text-xs text-white/40 font-mono mb-3">
              RECEIVERS
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {displayRecipients.map((recipient, i) => (
                <ReceiverCard
                  key={i}
                  recipient={recipient}
                  token={token}
                  isActive={isActive}
                />
              ))}
            </div>
          </div>

          {/* Privacy message */}
          <div className="mt-4 text-center">
            <div className={`text-xs font-mono ${isComplete ? 'text-cyan-500/60' : 'text-[hsl(var(--pink))]/60'}`}>
              No on-chain link between sender and recipients
            </div>
          </div>

          {/* Error details */}
          {isError && result?.error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-sm text-red-400 font-mono">{result.error}</div>
            </div>
          )}

          {/* Close/Done button */}
          <button
            onClick={onClose}
            disabled={isActive}
            className={`w-full mt-6 py-3 rounded-xl font-semibold font-mono transition-all ${
              isActive 
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-white text-black hover:bg-white/90'
            }`}
          >
            {isActive ? 'Processing...' : 'Done'}
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
