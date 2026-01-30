'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { TokenETH, TokenUSDT, TokenEURC } from '@web3icons/react';
import type { ComponentType, SVGProps } from 'react';
import type { PoolToken, TokenSymbol } from '@/lib/swap/types';
import { 
  TOKEN_LIST, 
  TOKENS,
  formatTokenAmount, 
  formatRoutePath,
  HIGH_SLIPPAGE_THRESHOLD,
} from '@/lib/swap';
import { usePoolQuote } from '@/hooks/usePoolQuote';
import { usePoolSwap, getExplorerLink } from '@/hooks/usePoolSwap';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import SlippageSettings, { useSlippageStorage } from './SlippageSettings';

// Token icon mapping
type Web3IconComponent = ComponentType<SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono'; className?: string }>;
const TOKEN_ICONS: Record<TokenSymbol, Web3IconComponent> = {
  ETH: TokenETH,
  USDT: TokenUSDT,
  EURC: TokenEURC,
};

// Helper component to render token icon
function TokenIcon({ symbol, className }: { symbol: TokenSymbol; className?: string }) {
  const Icon = TOKEN_ICONS[symbol];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

export default function SwapContent() {
  const { address, isConnected } = useAccount();
  
  // Token selection
  const [fromToken, setFromToken] = useState<PoolToken>(TOKENS.ETH);
  const [toToken, setToToken] = useState<PoolToken>(TOKENS.USDT);
  
  // Amount input
  const [fromAmount, setFromAmount] = useState('');
  
  // Slippage settings
  const [slippage, setSlippage] = useSlippageStorage();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  
  // Privacy mode
  const [privateMode, setPrivateMode] = useState(true);
  
  // Dropdown visibility
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false);
  
  // Hooks
  const { balances, refetch: refetchBalances } = useTokenBalances();
  const { quote, isLoading: isQuoteLoading, error: quoteError } = usePoolQuote({
    fromToken,
    toToken,
    inputAmount: fromAmount,
    slippage,
    enabled: isConnected,
  });
  const { executeSwap, progress, isSwapping, reset } = usePoolSwap();

  // Get formatted output amount
  const outputAmount = quote 
    ? formatTokenAmount(quote.outputAmount, toToken.decimals, 6)
    : '';

  // Get formatted minimum received
  const minReceived = quote
    ? formatTokenAmount(quote.minimumReceived, toToken.decimals, 6)
    : '';

  // Get formatted balance
  const fromBalance = formatTokenAmount(balances[fromToken.symbol], fromToken.decimals, 4);
  const toBalance = formatTokenAmount(balances[toToken.symbol], toToken.decimals, 4);

  // Check if user has sufficient balance
  const insufficientBalance = (() => {
    if (!fromAmount || fromAmount === '') return false;
    const inputParsed = parseFloat(fromAmount);
    const balanceParsed = parseFloat(fromBalance);
    return inputParsed > balanceParsed;
  })();

  // Swap direction
  const handleSwapDirection = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(outputAmount);
  };

  // Set max amount
  const handleMaxClick = () => {
    setFromAmount(fromBalance);
  };

  // Execute swap
  const handleSwap = async () => {
    if (!quote) return;
    
    const result = await executeSwap(quote, privateMode);
    
    if (result.success) {
      // Refresh balances after successful swap
      refetchBalances();
      setFromAmount('');
    }
  };

  // Get button state
  const getButtonState = (): { text: string; disabled: boolean } => {
    if (!isConnected) {
      return { text: 'Connect Wallet', disabled: true };
    }
    if (isSwapping) {
      return { text: progress.message, disabled: true };
    }
    if (!fromAmount || fromAmount === '' || parseFloat(fromAmount) === 0) {
      return { text: 'Enter Amount', disabled: true };
    }
    if (insufficientBalance) {
      return { text: `Insufficient ${fromToken.symbol}`, disabled: true };
    }
    if (isQuoteLoading) {
      return { text: 'Fetching Quote...', disabled: true };
    }
    if (quoteError) {
      return { text: 'No Route Available', disabled: true };
    }
    if (!quote) {
      return { text: 'Enter Amount', disabled: true };
    }
    return { text: 'Swap', disabled: false };
  };

  const buttonState = getButtonState();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFromTokenDropdown(false);
      setShowToTokenDropdown(false);
    };
    
    if (showFromTokenDropdown || showToTokenDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFromTokenDropdown, showToTokenDropdown]);

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 backdrop-blur p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Quick Swap</h3>
              <button
                onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Slippage Settings Panel */}
            {showSlippageSettings && (
              <div className="mb-4">
                <SlippageSettings
                  value={slippage}
                  onChange={setSlippage}
                  onClose={() => setShowSlippageSettings(false)}
                />
              </div>
            )}

            <div className="space-y-4">
              {/* From Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">From</label>
                  <span className="text-xs text-muted">
                    Balance: {fromBalance} {fromToken.symbol}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFromTokenDropdown(!showFromTokenDropdown);
                        setShowToTokenDropdown(false);
                      }}
                      className="h-10 w-10 flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                      <TokenIcon symbol={fromToken.symbol} className="h-10 w-10" />
                    </button>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="0.00"
                        value={fromAmount}
                        onChange={(e) => setFromAmount(e.target.value)}
                        className={`w-full bg-transparent text-2xl font-semibold outline-none ${
                          insufficientBalance ? 'text-red-400' : ''
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleMaxClick}
                        className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-xs text-muted hover:text-white"
                      >
                        MAX
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFromTokenDropdown(!showFromTokenDropdown);
                          setShowToTokenDropdown(false);
                        }}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                      >
                        {fromToken.symbol}
                      </button>
                    </div>
                  </div>

                  {/* From Token Dropdown */}
                  {showFromTokenDropdown && (
                    <div className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 max-h-60 overflow-y-auto">
                      {TOKEN_LIST.filter(t => t.symbol !== toToken.symbol).map((token) => (
                        <button
                          key={token.symbol}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFromToken(token);
                            setShowFromTokenDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <TokenIcon symbol={token.symbol} className="h-8 w-8" />
                          <div>
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-muted">{token.name}</div>
                          </div>
                          <div className="ml-auto text-sm text-muted">
                            {formatTokenAmount(balances[token.symbol], token.decimals, 4)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Swap Direction Button */}
              <div className="flex justify-center -my-2 relative z-10">
                <button
                  onClick={handleSwapDirection}
                  className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10 transition-colors hover:scale-110 transform"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* To Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">To</label>
                  <span className="text-xs text-muted">
                    Balance: {toBalance} {toToken.symbol}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowToTokenDropdown(!showToTokenDropdown);
                        setShowFromTokenDropdown(false);
                      }}
                      className="h-10 w-10 flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                      <TokenIcon symbol={toToken.symbol} className="h-10 w-10" />
                    </button>
                    <div className="flex-1">
                      <div className="text-2xl font-semibold text-muted">
                        {isQuoteLoading ? (
                          <span className="animate-pulse">...</span>
                        ) : outputAmount ? (
                          <span className="text-white">{outputAmount}</span>
                        ) : (
                          '0.00'
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowToTokenDropdown(!showToTokenDropdown);
                        setShowFromTokenDropdown(false);
                      }}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                    >
                      {toToken.symbol}
                    </button>
                  </div>

                  {/* To Token Dropdown */}
                  {showToTokenDropdown && (
                    <div className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 max-h-60 overflow-y-auto">
                      {TOKEN_LIST.filter(t => t.symbol !== fromToken.symbol).map((token) => (
                        <button
                          key={token.symbol}
                          onClick={(e) => {
                            e.stopPropagation();
                            setToToken(token);
                            setShowToTokenDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <TokenIcon symbol={token.symbol} className="h-8 w-8" />
                          <div>
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-muted">{token.name}</div>
                          </div>
                          <div className="ml-auto text-sm text-muted">
                            {formatTokenAmount(balances[token.symbol], token.decimals, 4)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Swap Details */}
              {quote && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Route</span>
                    <span className="font-medium">{formatRoutePath(quote.route)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Price Impact</span>
                    <span className={`font-medium ${quote.priceImpact > 1 ? 'text-yellow-400' : ''}`}>
                      {quote.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Min. Received</span>
                    <span className="font-medium">{minReceived} {toToken.symbol}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Slippage</span>
                    <span className={`font-medium ${slippage > HIGH_SLIPPAGE_THRESHOLD ? 'text-yellow-400' : ''}`}>
                      {slippage}%
                    </span>
                  </div>
                </div>
              )}

              {/* Privacy Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-black/20">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[hsl(var(--pink))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-medium">Private Swap</span>
                  <span className="text-xs text-muted">(via RAILGUN)</span>
                </div>
                <button
                  onClick={() => setPrivateMode(!privateMode)}
                  className={`
                    relative w-12 h-6 rounded-full transition-colors
                    ${privateMode ? 'bg-[hsl(var(--pink))]' : 'bg-white/20'}
                  `}
                >
                  <span
                    className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                      ${privateMode ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Transaction Progress */}
              {isSwapping && (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-black/20">
                  <div className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />
                  <span className="text-sm">{progress.message}</span>
                </div>
              )}

              {/* Success Message */}
              {progress.step === 'complete' && progress.txHash && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-green-500/20 bg-green-500/10">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-green-500">Swap complete!</span>
                  </div>
                  <a
                    href={getExplorerLink(progress.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-500 hover:underline"
                  >
                    View TX
                  </a>
                </div>
              )}

              {/* Error Message */}
              {progress.step === 'error' && progress.error && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm text-red-500">{progress.error.message}</span>
                </div>
              )}

              {/* Swap Button */}
              {isConnected ? (
                <button
                  onClick={handleSwap}
                  disabled={buttonState.disabled}
                  className={`
                    w-full rounded-xl px-4 py-4 font-semibold transition-all
                    ${buttonState.disabled
                      ? 'bg-white/10 text-muted cursor-not-allowed'
                      : 'bg-white text-[hsl(var(--pink))] hover:invert'
                    }
                  `}
                >
                  {buttonState.text}
                </button>
              ) : (
                <div className="w-full">
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <button
                        onClick={openConnectModal}
                        className="w-full rounded-xl bg-white px-4 py-4 font-semibold text-[hsl(var(--pink))] hover:invert transition-all"
                      >
                        Connect Wallet
                      </button>
                    )}
                  </ConnectButton.Custom>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
