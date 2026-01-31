'use client';

/**
 * Swap Content (Legacy - now uses unified config)
 * This component is kept for backwards compatibility.
 * For new implementations, use SimplifiedSwapContent instead.
 */

import { useState, useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { TokenETH, TokenUSDT, TokenEURC } from '@web3icons/react';
import type { ComponentType, SVGProps } from 'react';
import type { TokenConfig } from '@/lib/swap/unifiedConfig';
import {
  getTokensForChain,
  getTokenConfig,
  SUPPORTED_CHAINS,
} from '@/lib/swap/unifiedConfig';
import { useUniswapQuote } from '@/hooks/useUniswapQuote';
import { useUniswapSwap, getExplorerLink } from '@/hooks/useUniswapSwap';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { usePrivateSwap } from '@/hooks/usePrivateSwap';
import SlippageSettings, { useSlippageStorage } from './SlippageSettings';

// Token icon mapping
type Web3IconComponent = ComponentType<SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono'; className?: string }>;
const TOKEN_ICONS: Record<string, Web3IconComponent> = {
  ETH: TokenETH,
  USDT: TokenUSDT,
  EURC: TokenEURC,
  USDC: TokenUSDT, // Use USDT icon as fallback for USDC
  DAI: TokenUSDT,   // Use USDT icon as fallback for DAI
  WBTC: TokenETH,   // Use ETH icon as fallback for WBTC
};

// Helper component to render token icon
function TokenIcon({ symbol, className }: { symbol: string; className?: string }) {
  const Icon = TOKEN_ICONS[symbol];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

// Helper to format token amount
function formatTokenAmount(amount: bigint, decimals: number, displayDecimals: number = 6): string {
  if (amount === BigInt(0)) return '0';
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.slice(0, displayDecimals);
  if (trimmedFractional === '0'.repeat(displayDecimals)) {
    return integerPart.toString();
  }
  const cleanedFractional = trimmedFractional.replace(/0+$/, '');
  return `${integerPart}.${cleanedFractional}`;
}

const HIGH_SLIPPAGE_THRESHOLD = 2.0;

export default function SwapContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Get tokens for current chain (default to Arbitrum if unsupported)
  const supportedChainId = Object.values(SUPPORTED_CHAINS).includes(chainId as any)
    ? (chainId as typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS])
    : SUPPORTED_CHAINS.ARBITRUM;

  const tokenList = getTokensForChain(supportedChainId);

  // Token selection
  const [fromToken, setFromToken] = useState<TokenConfig>(tokenList[0]); // Defaults to first token (ETH/WETH)
  const [toToken, setToToken] = useState<TokenConfig>(tokenList[1]);     // Defaults to second token (USDC/USDT)
  
  // Amount input
  const [fromAmount, setFromAmount] = useState('');

  // Private mode (RAILGUN) - MAIN FEATURE
  const [privateMode, setPrivateMode] = useState(true);

  // Slippage settings
  const [slippage, setSlippage] = useSlippageStorage();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  // Dropdown visibility
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false);
  
  // Hooks
  const { balances, refetch: refetchBalances } = useTokenBalances();

  // Private swap hook (RAILGUN)
  const { executePrivateSwap, progress: privateProgress, isSwapping: isPrivateSwapping, reset: resetPrivate } = usePrivateSwap();

  // Uniswap hooks - used for BOTH private and public modes
  const { quote: uniswapQuote, isLoading: isQuoteLoading, error: quoteError } = useUniswapQuote({
    fromToken,
    toToken,
    inputAmount: fromAmount,
    slippage,
    enabled: isConnected, // Always enabled for both modes
  });
  const { executeSwap: executeUniswapSwap, progress: uniswapProgress, isSwapping: isUniswapSwapping, reset: resetUniswap } = useUniswapSwap();

  // Unified state based on mode
  const currentQuote = uniswapQuote;
  const isSwapping = privateMode ? isPrivateSwapping : isUniswapSwapping;
  const progress = privateMode ? {
    step: privateProgress?.step || 'idle',
    message: privateProgress?.message || '',
    inputShieldTxHash: privateProgress?.inputShieldTxHash,
    swapTxHash: privateProgress?.swapTxHash,
    error: privateProgress?.error,
  } : uniswapProgress;

  // Get formatted output amount
  const outputAmount = currentQuote
    ? formatTokenAmount(currentQuote.outputAmount, toToken.decimals, 6)
    : '';

  // Get formatted minimum received
  const minReceived = currentQuote
    ? formatTokenAmount(currentQuote.minimumReceived, toToken.decimals, 6)
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
    if (!currentQuote) return;

    let result;

    if (privateMode) {
      // Use RAILGUN private swap + Uniswap (via DEX adapter)
      // Note: This will use the standardized private swap service with Uniswap adapter
      result = await executePrivateSwap(currentQuote);

      if (result.success) {
        refetchBalances();
        setFromAmount('');
        resetPrivate();
      }
    } else {
      // Use Uniswap v3 public swap (direct)
      result = await executeUniswapSwap(currentQuote);

      if (result.success) {
        refetchBalances();
        setFromAmount('');
        resetUniswap();
      }
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
    if (!currentQuote) {
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
              <div className="flex items-center gap-2">
                {/* Private Mode Toggle */}
                <button
                  onClick={() => setPrivateMode(!privateMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    privateMode
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-white/5 text-muted hover:text-white border border-white/10'
                  }`}
                >
                  {privateMode ? '🔒 Private' : 'Public'}
                </button>
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
                      {tokenList.filter(t => t.address.toLowerCase() !== toToken.address.toLowerCase()).map((token) => (
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
                      {tokenList.filter(t => t.address.toLowerCase() !== fromToken.address.toLowerCase()).map((token) => (
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
              {currentQuote && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Mode</span>
                    <span className={`font-medium ${privateMode ? 'text-pink-400' : 'text-blue-400'}`}>
                      {privateMode ? 'Private (RAILGUN)' : 'Public (Uniswap)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Route</span>
                    <span className="font-medium">
                      {uniswapQuote?.route.tokenPath.map(t => t.symbol).join(' → ') || '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Price Impact</span>
                    <span className={`font-medium ${currentQuote.priceImpact > 1 ? 'text-yellow-400' : ''}`}>
                      {currentQuote.priceImpact.toFixed(2)}%
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

<<<<<<< Updated upstream
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
=======
              {/* Transaction Progress */}
              {isSwapping && (
                <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />
                    <span className="text-sm">{progress.message}</span>
                  </div>
>>>>>>> Stashed changes
                </div>
              )}

              {/* Success Message */}
<<<<<<< Updated upstream
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
=======
              {progress.step === 'complete' && (('txHash' in progress && progress.txHash) || ('swapTxHash' in progress && progress.swapTxHash)) && (
                <div className="space-y-2 p-3 rounded-xl border border-green-500/20 bg-green-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-green-500">
                        {privateMode ? 'Private swap complete!' : 'Swap complete!'}
                      </span>
                    </div>
                    {'txHash' in progress && progress.txHash && (
                      <a
                        href={getExplorerLink(progress.txHash, fromToken.chainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-500 hover:underline"
                      >
                        View TX
                      </a>
                    )}
                  </div>
                  {/* Private swap shows additional TXs */}
                  {privateMode && 'inputShieldTxHash' in progress && progress.inputShieldTxHash && (
                    <div className="text-xs text-green-400 mt-1 space-y-1">
                      <div>Shield: <span className="opacity-70">{progress.inputShieldTxHash.slice(0, 10)}...</span></div>
                      {'swapTxHash' in progress && progress.swapTxHash && (
                        <div>Swap: <span className="opacity-70">{progress.swapTxHash.slice(0, 10)}...</span></div>
                      )}
                    </div>
                  )}
>>>>>>> Stashed changes
                </div>
              )}

              {/* Error Message */}
              {progress.step === 'error' && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm text-red-500">
                    {'error' in progress && typeof progress.error === 'string' ? progress.error : 'Swap failed'}
                  </span>
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
