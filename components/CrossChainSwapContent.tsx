'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { TokenETH, TokenUSDT, TokenEURC, NetworkSepolia, NetworkArbitrumSepolia, NetworkPolygonAmoy } from '@web3icons/react';
import type { ComponentType, SVGProps } from 'react';
import type { PoolToken, TokenSymbol } from '@/lib/swap/types';
import type { ChainId, CrossChainQuote } from '@/lib/swap/crossChainTypes';
import { formatTokenAmount, HIGH_SLIPPAGE_THRESHOLD } from '@/lib/swap';
import {
  CROSS_CHAIN_TOKENS,
  CHAIN_IDS,
  CHAIN_NAMES,
  SUPPORTED_DESTINATION_CHAINS,
} from '@/lib/swap/crossChainConfig';
import { useCrossChainSwap } from '@/hooks/useCrossChainSwap';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import SlippageSettings, { useSlippageStorage } from './SlippageSettings';
import { EXPLORER_URL } from '@/lib/wagmi';

// Token icon mapping
type Web3IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono'; className?: string }
>;
const TOKEN_ICONS: Record<TokenSymbol, Web3IconComponent> = {
  ETH: TokenETH,
  USDT: TokenUSDT,
  EURC: TokenEURC,
};

// Chain icon mapping
const CHAIN_ICONS: Record<number, Web3IconComponent> = {
  [CHAIN_IDS.SEPOLIA]: NetworkSepolia,
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: NetworkArbitrumSepolia,
  [CHAIN_IDS.POLYGON_AMOY]: NetworkPolygonAmoy,
};

// Helper component to render chain icon
function ChainIcon({
  chainId,
  className,
}: {
  chainId: ChainId;
  className?: string;
}) {
  const Icon = CHAIN_ICONS[chainId];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

// Token list from cross-chain config
const TOKEN_LIST = Object.values(CROSS_CHAIN_TOKENS);

// Chain options for source (all supported chains)
const SOURCE_CHAIN_OPTIONS = [
  { id: CHAIN_IDS.SEPOLIA, name: CHAIN_NAMES[CHAIN_IDS.SEPOLIA] },
  ...SUPPORTED_DESTINATION_CHAINS.map((id) => ({
    id,
    name: CHAIN_NAMES[id] || `Chain ${id}`,
  })),
];

// Chain options for destination
const DEST_CHAIN_OPTIONS = [
  { id: CHAIN_IDS.SEPOLIA, name: CHAIN_NAMES[CHAIN_IDS.SEPOLIA] },
  ...SUPPORTED_DESTINATION_CHAINS.map((id) => ({
    id,
    name: CHAIN_NAMES[id] || `Chain ${id}`,
  })),
];

// Helper component to render token icon
function TokenIcon({
  symbol,
  className,
}: {
  symbol: TokenSymbol;
  className?: string;
}) {
  const Icon = TOKEN_ICONS[symbol];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

function getExplorerLink(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export default function CrossChainSwapContent() {
  const { address, isConnected } = useAccount();

  // Token selection
  const [fromToken, setFromToken] = useState<PoolToken>(CROSS_CHAIN_TOKENS.ETH);
  const [toToken, setToToken] = useState<PoolToken>(CROSS_CHAIN_TOKENS.USDT);

  // Source and destination chains
  const [fromChainId, setFromChainId] = useState<ChainId>(CHAIN_IDS.SEPOLIA);
  const [destChainId, setDestChainId] = useState<ChainId>(CHAIN_IDS.ARBITRUM_SEPOLIA);

  // Amount input
  const [fromAmount, setFromAmount] = useState('');

  // Quote state
  const [quote, setQuote] = useState<CrossChainQuote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Slippage settings
  const [slippage, setSlippage] = useSlippageStorage();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  // Dropdown visibility
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false);
  const [showFromChainDropdown, setShowFromChainDropdown] = useState(false);
  const [showToChainDropdown, setShowToChainDropdown] = useState(false);

  // Hooks
  const { balances, refetch: refetchBalances } = useTokenBalances();
  const {
    getQuote,
    executeSwap,
    executeTransfer,
    executeCrossChainSwap,
    progress,
    isExecuting,
    reset,
  } = useCrossChainSwap();

  // Parse amount helper
  const parseAmount = useCallback(
    (amount: string, decimals: number): bigint => {
      if (!amount || amount === '' || amount === '.') return BigInt(0);
      const [integerPart, fractionalPart = ''] = amount.split('.');
      const paddedFractional = fractionalPart
        .padEnd(decimals, '0')
        .slice(0, decimals);
      return BigInt(integerPart + paddedFractional);
    },
    []
  );

  // Fetch quote when inputs change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!fromAmount || fromAmount === '' || parseFloat(fromAmount) === 0) {
        setQuote(null);
        return;
      }

      setIsQuoteLoading(true);
      setQuoteError(null);

      try {
        const amountIn = parseAmount(fromAmount, fromToken.decimals);
        const newQuote = await getQuote(
          fromToken,
          toToken,
          amountIn,
          destChainId,
          slippage
        );

        if (newQuote) {
          setQuote(newQuote);
        } else {
          setQuoteError('No route found');
          setQuote(null);
        }
      } catch (err) {
        setQuoteError(err instanceof Error ? err.message : 'Failed to get quote');
        setQuote(null);
      } finally {
        setIsQuoteLoading(false);
      }
    };

    const debounceTimeout = setTimeout(fetchQuote, 300);
    return () => clearTimeout(debounceTimeout);
  }, [fromAmount, fromToken, toToken, fromChainId, destChainId, slippage, getQuote, parseAmount]);

  // Get formatted output amount
  const outputAmount = quote
    ? formatTokenAmount(quote.amountOut, toToken.decimals, 6)
    : '';

  // Get formatted balance
  const fromBalance = formatTokenAmount(
    balances[fromToken.symbol],
    fromToken.decimals,
    4
  );
  const toBalance = formatTokenAmount(
    balances[toToken.symbol],
    toToken.decimals,
    4
  );

  // Check if user has sufficient balance
  const insufficientBalance = (() => {
    if (!fromAmount || fromAmount === '') return false;
    const inputParsed = parseFloat(fromAmount);
    const balanceParsed = parseFloat(fromBalance);
    return inputParsed > balanceParsed;
  })();

  // Is cross-chain operation
  const isCrossChain = fromChainId !== destChainId;

  // Swap direction - swap tokens, chains, and amount
  const handleSwapDirection = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);

    const tempChain = fromChainId;
    setFromChainId(destChainId);
    setDestChainId(tempChain);

    setFromAmount(outputAmount);
  };

  // Set max amount
  const handleMaxClick = () => {
    setFromAmount(fromBalance);
  };

  // Execute swap/transfer
  const handleSwap = async () => {
    if (!quote || !address) return;

    let result;

    if (quote.type === 'swap') {
      result = await executeSwap(quote);
    } else if (quote.type === 'transfer') {
      result = await executeTransfer(quote, address);
    } else if (quote.type === 'cross_chain_swap') {
      result = await executeCrossChainSwap(quote, address);
    }

    if (result?.success) {
      refetchBalances();
      setFromAmount('');
      setQuote(null);
    }
  };

  // Get button state
  const getButtonState = (): { text: string; disabled: boolean } => {
    if (!isConnected) {
      return { text: 'Connect Wallet', disabled: true };
    }
    if (isExecuting) {
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

    // Dynamic button text based on operation type
    if (quote.type === 'transfer') {
      return { text: `Transfer to ${CHAIN_NAMES[destChainId]}`, disabled: false };
    }
    if (quote.type === 'cross_chain_swap') {
      return { text: `Swap to ${CHAIN_NAMES[destChainId]}`, disabled: false };
    }
    return { text: isCrossChain ? `Swap to ${CHAIN_NAMES[destChainId]}` : 'Swap', disabled: false };
  };

  const buttonState = getButtonState();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFromTokenDropdown(false);
      setShowToTokenDropdown(false);
      setShowFromChainDropdown(false);
      setShowToChainDropdown(false);
    };

    if (showFromTokenDropdown || showToTokenDropdown || showFromChainDropdown || showToChainDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFromTokenDropdown, showToTokenDropdown, showFromChainDropdown, showToChainDropdown]);

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 backdrop-blur p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Cross-Chain Swap</h3>
                <p className="text-xs text-muted">
                  Swap or transfer across chains
                </p>
              </div>
              <button
                onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted hover:text-white"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
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
                        setShowFromChainDropdown(false);
                        setShowToChainDropdown(false);
                      }}
                      className="h-10 w-10 flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                      <TokenIcon
                        symbol={fromToken.symbol}
                        className="h-10 w-10"
                      />
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
                          setShowFromChainDropdown(false);
                          setShowToChainDropdown(false);
                        }}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                      >
                        {fromToken.symbol}
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFromChainDropdown(!showFromChainDropdown);
                            setShowToChainDropdown(false);
                            setShowFromTokenDropdown(false);
                            setShowToTokenDropdown(false);
                          }}
                          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                        >
                          <ChainIcon chainId={fromChainId} className="w-5 h-5" />
                        </button>
                        {showFromChainDropdown && (
                          <div className="absolute top-full right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-20 min-w-[180px]">
                            {SOURCE_CHAIN_OPTIONS.map((chain) => (
                              <button
                                key={chain.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFromChainId(chain.id);
                                  setShowFromChainDropdown(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                                  fromChainId === chain.id ? 'bg-white/5' : ''
                                }`}
                              >
                                <ChainIcon chainId={chain.id} className="w-6 h-6" />
                                <span className="font-medium text-sm">{chain.name}</span>
                                {fromChainId === chain.id && (
                                  <svg
                                    className="w-4 h-4 ml-auto text-green-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* From Token Dropdown */}
                  {showFromTokenDropdown && (
                    <div className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 max-h-60 overflow-y-auto">
                      {TOKEN_LIST.filter(
                        (t) => t.symbol !== toToken.symbol
                      ).map((token) => (
                        <button
                          key={token.symbol}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFromToken(token);
                            setShowFromTokenDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <TokenIcon
                            symbol={token.symbol}
                            className="h-8 w-8"
                          />
                          <div>
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-muted">
                              {token.name}
                            </div>
                          </div>
                          <div className="ml-auto text-sm text-muted">
                            {formatTokenAmount(
                              balances[token.symbol],
                              token.decimals,
                              4
                            )}
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
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </button>
              </div>

              {/* To Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">To</label>
                  {!isCrossChain && (
                    <span className="text-xs text-muted">
                      Balance: {toBalance} {toToken.symbol}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowToTokenDropdown(!showToTokenDropdown);
                        setShowFromTokenDropdown(false);
                        setShowFromChainDropdown(false);
                        setShowToChainDropdown(false);
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowToTokenDropdown(!showToTokenDropdown);
                          setShowFromTokenDropdown(false);
                          setShowFromChainDropdown(false);
                          setShowToChainDropdown(false);
                        }}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                      >
                        {toToken.symbol}
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowToChainDropdown(!showToChainDropdown);
                            setShowFromChainDropdown(false);
                            setShowFromTokenDropdown(false);
                            setShowToTokenDropdown(false);
                          }}
                          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                        >
                          <ChainIcon chainId={destChainId} className="w-5 h-5" />
                        </button>
                        {showToChainDropdown && (
                          <div className="absolute top-full right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-20 min-w-[180px]">
                            {DEST_CHAIN_OPTIONS.map((chain) => (
                              <button
                                key={chain.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDestChainId(chain.id);
                                  setShowToChainDropdown(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                                  destChainId === chain.id ? 'bg-white/5' : ''
                                }`}
                              >
                                <ChainIcon chainId={chain.id} className="w-6 h-6" />
                                <span className="font-medium text-sm">{chain.name}</span>
                                {destChainId === chain.id && (
                                  <svg
                                    className="w-4 h-4 ml-auto text-green-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* To Token Dropdown */}
                  {showToTokenDropdown && (
                    <div className="rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 max-h-60 overflow-y-auto">
                      {TOKEN_LIST.filter(
                        (t) => t.symbol !== fromToken.symbol
                      ).map((token) => (
                        <button
                          key={token.symbol}
                          onClick={(e) => {
                            e.stopPropagation();
                            setToToken(token);
                            setShowToTokenDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <TokenIcon
                            symbol={token.symbol}
                            className="h-8 w-8"
                          />
                          <div>
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-xs text-muted">
                              {token.name}
                            </div>
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
                    <span className="font-medium">
                      {CHAIN_NAMES[fromChainId]} → {CHAIN_NAMES[destChainId]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Operation</span>
                    <span className="font-medium capitalize">
                      {quote.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Fee</span>
                    <span className="font-medium">
                      {(quote.feeBps / 100).toFixed(2)}%
                    </span>
                  </div>
                  {('priceImpact' in quote) && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Price Impact</span>
                      <span
                        className={`font-medium ${
                          quote.priceImpact > 1 ? 'text-yellow-400' : ''
                        }`}
                      >
                        {quote.priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {('minAmountOut' in quote) && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Min. Received</span>
                      <span className="font-medium">
                        {formatTokenAmount(quote.minAmountOut, toToken.decimals, 6)}{' '}
                        {toToken.symbol}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Slippage</span>
                    <span
                      className={`font-medium ${
                        slippage > HIGH_SLIPPAGE_THRESHOLD ? 'text-yellow-400' : ''
                      }`}
                    >
                      {slippage}%
                    </span>
                  </div>
                </div>
              )}

              {/* Transaction Progress */}
              {isExecuting && (
                <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />
                    <span className="text-sm">{progress.message}</span>
                  </div>

                  {progress.sourceTxHash && (
                    <div className="flex items-center justify-between text-xs text-muted pt-1 border-t border-white/5">
                      <span>Source TX:</span>
                      <a
                        href={getExplorerLink(progress.sourceTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline hover:text-white"
                      >
                        {progress.sourceTxHash.slice(0, 10)}...
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Success Message */}
              {progress.step === 'complete' && progress.sourceTxHash && (
                <div className="space-y-2 p-3 rounded-xl border border-green-500/20 bg-green-500/10">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm text-green-500">
                      Transaction successful
                    </span>
                  </div>
                  <a
                    href={getExplorerLink(progress.sourceTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-green-500 hover:underline font-mono break-all"
                  >
                    {progress.sourceTxHash}
                  </a>
                </div>
              )}

              {/* Error Message */}
              {progress.step === 'error' && progress.error && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="text-sm text-red-500">
                    {progress.error.message}
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
                    ${
                      buttonState.disabled
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
