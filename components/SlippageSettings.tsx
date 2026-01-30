'use client';

import { useState, useEffect } from 'react';
import { SLIPPAGE_PRESETS, HIGH_SLIPPAGE_THRESHOLD, DEFAULT_SLIPPAGE } from '@/lib/swap';

interface SlippageSettingsProps {
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
}

const STORAGE_KEY = 'swap-slippage';

export function useSlippageStorage(): [number, (value: number) => void] {
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
        setSlippage(parsed);
      }
    }
  }, []);

  const updateSlippage = (value: number) => {
    setSlippage(value);
    localStorage.setItem(STORAGE_KEY, value.toString());
  };

  return [slippage, updateSlippage];
}

export default function SlippageSettings({ value, onChange, onClose }: SlippageSettingsProps) {
  const [customValue, setCustomValue] = useState('');
  const [isCustom, setIsCustom] = useState(!SLIPPAGE_PRESETS.includes(value as 0.1 | 0.5 | 1.0));

  const handlePresetClick = (preset: number) => {
    setIsCustom(false);
    setCustomValue('');
    onChange(preset);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomValue(val);
    setIsCustom(true);

    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
      onChange(parsed);
    }
  };

  const isHighSlippage = value > HIGH_SLIPPAGE_THRESHOLD;

  return (
    <div className="rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Slippage Tolerance</h4>
        <button
          onClick={onClose}
          className="text-muted hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex gap-2">
        {SLIPPAGE_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={`
              flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
              ${!isCustom && value === preset
                ? 'bg-white text-black'
                : 'bg-white/5 hover:bg-white/10 text-white'
              }
            `}
          >
            {preset}%
          </button>
        ))}
        <div className="relative flex-1">
          <input
            type="number"
            placeholder="Custom"
            value={customValue}
            onChange={handleCustomChange}
            className={`
              w-full py-2 px-3 rounded-lg text-sm font-medium outline-none transition-colors
              ${isCustom
                ? 'bg-white text-black'
                : 'bg-white/5 text-white placeholder:text-muted'
              }
            `}
            min="0.01"
            max="50"
            step="0.1"
          />
          <span className={`
            absolute right-3 top-1/2 -translate-y-1/2 text-sm
            ${isCustom ? 'text-black/50' : 'text-muted'}
          `}>
            %
          </span>
        </div>
      </div>

      {isHighSlippage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <svg className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm">
            <p className="text-yellow-500 font-medium">High slippage warning</p>
            <p className="text-yellow-500/70">Your transaction may be frontrun or receive unfavorable rates.</p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        Your transaction will revert if the price changes unfavorably by more than this percentage.
      </p>
    </div>
  );
}
