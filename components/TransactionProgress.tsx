'use client';

import { motion } from 'framer-motion';
import type { TransferStep, TransferProgress as ProgressType } from '@/hooks/usePrivateTransfer';

interface TransactionProgressProps {
  progress: ProgressType;
  onCancel?: () => void;
}

const STEP_ORDER: TransferStep[] = [
  'preparing',
  'signing',
  'approving',
  'shielding',
  'waiting_poi',
  'generating_proof',
  'unshielding',
  'complete',
];

const STEP_LABELS: Record<TransferStep, string> = {
  idle: 'Ready',
  preparing: 'Preparing transfer',
  signing: 'Waiting for signature',
  approving: 'Processing approval',
  shielding: 'Shielding tokens',
  waiting_poi: 'Verifying POI',
  generating_proof: 'Generating ZK proof',
  transferring: 'Transferring',
  unshielding: 'Unshielding to recipient',
  complete: 'Complete',
  error: 'Failed',
};

export default function TransactionProgress({ progress, onCancel }: TransactionProgressProps) {
  const { step, progress: percent, message, details } = progress;

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const isError = step === 'error';
  const isComplete = step === 'complete';

  const getStepStatus = (stepName: TransferStep): 'pending' | 'active' | 'complete' | 'error' => {
    if (isError) return 'error';
    const stepIndex = STEP_ORDER.indexOf(stepName);
    if (stepIndex < currentStepIndex) return 'complete';
    if (stepIndex === currentStepIndex) return 'active';
    return 'pending';
  };

  // Calculate elapsed time for active steps
  const getTimeEstimate = (stepName: TransferStep): string | null => {
    if (stepName === 'generating_proof') return '~30s';
    if (stepName === 'waiting_poi') return '~60s';
    if (stepName === 'shielding') return '~15s';
    if (stepName === 'unshielding') return '~15s';
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        {/* Header - Current Status */}
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

        {/* Current Step Message */}
        <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-sm text-white">{message}</div>
          {details && (
            <div className="text-xs text-white/50 mt-1 font-mono">{details}</div>
          )}
        </div>

        {/* Step List */}
        <div className="space-y-1">
          {STEP_ORDER.map((stepName) => {
            const status = getStepStatus(stepName);
            const timeEstimate = getTimeEstimate(stepName);
            const isActive = status === 'active';
            
            return (
              <div
                key={stepName}
                className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                  isActive ? 'bg-white/10' : ''
                }`}
              >
                {/* Status Indicator */}
                <div className="w-5 flex justify-center">
                  {status === 'complete' ? (
                    <span className="text-green-400">+</span>
                  ) : status === 'active' ? (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-white"
                    >
                      &gt;
                    </motion.span>
                  ) : status === 'error' ? (
                    <span className="text-red-400">x</span>
                  ) : (
                    <span className="text-white/20">-</span>
                  )}
                </div>
                
                {/* Step Label */}
                <span className={`flex-1 ${
                  status === 'complete' ? 'text-white/50' :
                  status === 'active' ? 'text-white' :
                  status === 'error' ? 'text-red-400' :
                  'text-white/30'
                }`}>
                  {STEP_LABELS[stepName]}
                </span>
                
                {/* Time Estimate for Active Step */}
                {isActive && timeEstimate && (
                  <span className="text-xs text-white/40">{timeEstimate}</span>
                )}
                
                {/* Checkmark for Complete */}
                {status === 'complete' && (
                  <span className="text-xs text-white/40">done</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Error Message */}
        {isError && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="text-sm text-red-400">{message}</div>
          </div>
        )}

        {/* Cancel Button */}
        {!isComplete && !isError && onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-4 py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
        )}
      </motion.div>
    </div>
  );
}
