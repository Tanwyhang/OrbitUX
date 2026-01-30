'use client';

import { motion } from 'framer-motion';
import { Loader2, Check, Shield, Zap, Lock, Unlock, AlertCircle } from 'lucide-react';
import type { TransferStep, TransferProgress as ProgressType } from '@/hooks/usePrivateTransfer';

interface TransactionProgressProps {
  progress: ProgressType;
  onCancel?: () => void;
}

const STEP_ICONS: Record<TransferStep, React.ReactNode> = {
  idle: <Shield className="w-5 h-5" />,
  preparing: <Loader2 className="w-5 h-5" />,
  approving: <Unlock className="w-5 h-5" />,
  shielding: <Lock className="w-5 h-5" />,
  waiting_poi: <Shield className="w-5 h-5" />,
  generating_proof: <Zap className="w-5 h-5" />,
  transferring: <Shield className="w-5 h-5" />,
  unshielding: <Unlock className="w-5 h-5" />,
  complete: <Check className="w-5 h-5" />,
  error: <AlertCircle className="w-5 h-5" />,
};

const STEP_ORDER: TransferStep[] = [
  'preparing',
  'approving',
  'shielding',
  'waiting_poi',
  'generating_proof',
  'transferring',
  'unshielding',
  'complete',
];

const STEP_LABELS: Record<TransferStep, string> = {
  idle: 'Ready',
  preparing: 'Preparing',
  approving: 'Approving',
  shielding: 'Shielding',
  waiting_poi: 'POI Verification',
  generating_proof: 'Generating Proof',
  transferring: 'Transferring',
  unshielding: 'Unshielding',
  complete: 'Complete',
  error: 'Error',
};

export default function TransactionProgress({ progress, onCancel }: TransactionProgressProps) {
  const { step, progress: percent, message, details } = progress;

  const currentStepIndex = STEP_ORDER.indexOf(step);

  const getStepStatus = (stepName: TransferStep): 'pending' | 'active' | 'complete' | 'error' => {
    if (step === 'error') return 'error';
    const stepIndex = STEP_ORDER.indexOf(stepName);
    if (stepIndex < currentStepIndex) return 'complete';
    if (stepIndex === currentStepIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black/90 p-6 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--pink))]/20 mb-4">
            {step === 'complete' ? (
              <Check className="w-8 h-8 text-green-400" />
            ) : step === 'error' ? (
              <AlertCircle className="w-8 h-8 text-red-400" />
            ) : (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-8 h-8 text-[hsl(var(--pink))]" />
              </motion.div>
            )}
          </div>
          <h2 className="text-xl font-bold mb-1">{message}</h2>
          {details && (
            <p className="text-sm text-white/60 font-mono">{details}</p>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-white/60 mb-2">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                step === 'error' ? 'bg-red-500' : 
                step === 'complete' ? 'bg-green-500' : 
                'bg-[hsl(var(--pink))]'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="space-y-2">
          {STEP_ORDER.map((stepName, index) => {
            const status = getStepStatus(stepName);
            
            return (
              <motion.div
                key={stepName}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  status === 'active' ? 'bg-[hsl(var(--pink))]/10' :
                  status === 'complete' ? 'bg-green-500/10' :
                  status === 'error' ? 'bg-red-500/10' :
                  'bg-white/5'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${
                  status === 'active' ? 'bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]' :
                  status === 'complete' ? 'bg-green-500/20 text-green-400' :
                  status === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-white/10 text-white/40'
                }`}>
                  {status === 'complete' ? (
                    <Check className="w-4 h-4" />
                  ) : status === 'active' ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    STEP_ICONS[stepName]
                  )}
                </div>
                <span className={`text-sm ${
                  status === 'active' ? 'text-white font-medium' :
                  status === 'complete' ? 'text-green-400' :
                  status === 'error' ? 'text-red-400' :
                  'text-white/40'
                }`}>
                  {STEP_LABELS[stepName]}
                </span>
                {status === 'active' && stepName === 'generating_proof' && (
                  <span className="ml-auto text-xs text-white/40">~30s</span>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* ZK Proof Explanation */}
        {step === 'generating_proof' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-lg bg-[hsl(var(--pink))]/10 border border-[hsl(var(--pink))]/20"
          >
            <p className="text-xs text-white/80">
              Generating a Zero-Knowledge proof that proves your transaction is valid 
              without revealing any details about sender, receiver, or amount.
            </p>
          </motion.div>
        )}

        {/* Cancel Button (only show when not complete or error) */}
        {step !== 'complete' && step !== 'error' && onCancel && (
          <button
            onClick={onCancel}
            className="w-full mt-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
      </motion.div>
    </div>
  );
}
