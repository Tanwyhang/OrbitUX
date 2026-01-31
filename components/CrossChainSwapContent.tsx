'use client';

/**
 * Cross-Chain Swap Content (Legacy - now uses unified config)
 * This component is kept for backwards compatibility.
 * For new implementations, use SimplifiedSwapContent instead.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  TokenETH, TokenUSDT, TokenEURC,
  NetworkEthereum, NetworkSepolia,
  NetworkArbitrumOne, NetworkPolygon
} from '@web3icons/react';
import type { ComponentType, SVGProps } from 'react';
import type { TokenConfig, SupportedChainId } from '@/lib/swap/unifiedConfig';
import type { CrossChainQuote as UniswapCrossChainQuote } from '@/lib/swap/uniswap/uniswapTypes';
import {
  getTokensForChain,
  SUPPORTED_CHAINS,
} from '@/lib/swap/unifiedConfig';
import { useCrossChainSwap, useCrossChainQuote, formatDuration } from '@/hooks/useUniswapCrossChainSwap';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import SlippageSettings, { useSlippageStorage } from './SlippageSettings';

// Token icon mapping
type Web3IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono'; className?: string }
>;

// Chain icon mapping (only Arbitrum and Polygon in unified config)
const CHAIN_ICONS: Record<number, Web3IconComponent> = {
  [SUPPORTED_CHAINS.ARBITRUM]: NetworkArbitrumOne,
  [SUPPORTED_CHAINS.POLYGON]: NetworkPolygon,
};

// Chain names
const CHAIN_NAMES: Record<number, string> = {
  [SUPPORTED_CHAINS.ARBITRUM]: 'Arbitrum',
  [SUPPORTED_CHAINS.POLYGON]: 'Polygon',
};

// Token icon mapping
const TOKEN_ICONS: Record<string, Web3IconComponent> = {
  ETH: TokenETH,
  USDT: TokenUSDT,
  EURC: TokenEURC,
  USDC: TokenUSDT,
  DAI: TokenUSDT,
  WBTC: TokenETH,
  WETH: TokenETH,
};

// Helper component to render chain icon
function ChainIcon({
  chainId,
  className,
}: {
  chainId: number;
  className?: string;
}) {
  const Icon = CHAIN_ICONS[chainId];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

// Helper component to render token icon
function TokenIcon({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
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

// Helper to get explorer link
function getExplorerLink(txHash: string, chainId: number = 1): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
    42161: 'https://arbiscan.io',
    137: 'https://polygonscan.com',
  };
  const baseUrl = explorers[chainId] || 'https://etherscan.io';
  return `${baseUrl}/tx/${txHash}`;
}

export default function CrossChainSwapContent() {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();

  // Get supported chain ID (default to Arbitrum if not supported)
  const fromChainId = Object.values(SUPPORTED_CHAINS).includes(currentChainId as any)
    ? currentChainId
    : SUPPORTED_CHAINS.ARBITRUM;

  // Get tokens for source and destination chains
  const fromTokenList = getTokensForChain(fromChainId as typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS]);
  const [destChainId, setDestChainId] = useState<number>(SUPPORTED_CHAINS.ARBITRUM);

  // Get tokens for destination chain
  const toTokenList = getTokensForChain(destChainId as typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS]);

  // Token selection
  const [fromToken, setFromToken] = useState<TokenConfig>(fromTokenList[0]);
  const [toToken, setToToken] = useState<TokenConfig>(toTokenList[0]);

  // Amount input
  const [fromAmount, setFromAmount] = useState('');

  // Slippage settings
  const [slippage, setSlippage] = useSlippageStorage();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  // Dropdown visibility
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false);
  const [showDestChainDropdown, setShowDestChainDropdown] = useState(false);

  // Hooks
  const { balances, refetch: refetchBalances } = useTokenBalances();
  const { quote, isLoading: isQuoteLoading, error: quoteError } = useCrossChainQuote({
    fromToken,
    toToken,
    fromChainId: fromToken.chainId,
    toChainId: toToken.chainId,
    inputAmount: fromAmount,
    slippage,
    enabled: isConnected,
  });
  const { executeSwap, progress, isSwapping, reset } = useCrossChainSwap();

  // Chain options for destination (all chains except current)
  const CHAIN_OPTIONS = Object.values(SUPPORTED_CHAINS)
    .filter(id => id !== fromChainId)
    .map(id => ({ id, name: CHAIN_NAMES[id] || `Chain ${id}` }));

  // Get formatted output amount
  const outputAmount = quote
    ? formatTokenAmount(quote.outputAmount, toToken.decimals, 6)
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

  // Is cross-chain operation (always true for this component)
  const isCrossChain = destChainId !== fromChainId;

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

  // Execute swap/transfer
  const handleSwap = async () => {
    if (!quote || !address) return;

    const result = await executeSwap(quote);

    if (result?.success) {
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

    // Dynamic button text based on operation type
    // Cross-chain swap button text
    if (isCrossChain) {
      return { text: `Swap to ${CHAIN_NAMES[destChainId]}`, disabled: false };
    }
    return { text: 'Swap', disabled: false };
  };

  const buttonState = getButtonState();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFromTokenDropdown(false);
      setShowToTokenDropdown(false);
      setShowDestChainDropdown(false);
    };

    if (showFromTokenDropdown || showToTokenDropdown || showDestChainDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFromTokenDropdown, showToTokenDropdown, showDestChainDropdown]);

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
              {/* Destination Chain Selector */}
              <div className="space-y-2">
                <label className="text-sm text-muted">Destination Chain</label>
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDestChainDropdown(!showDestChainDropdown);
                    }}
                    className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChainIcon chainId={destChainId} className="w-6 h-6" />
                      <span className="font-medium">
                        {CHAIN_NAMES[destChainId] || `Chain ${destChainId}`}
                      </span>
                    </div>
                    <svg
                      className="w-4 h-4 text-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showDestChainDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-20">
                      {CHAIN_OPTIONS.map((chain) => (
                        <button
                          key={chain.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDestChainId(chain.id);
                            setShowDestChainDropdown(false);
                            // Reset toToken to first token on new chain
                            const newTokenList = getTokensForChain(chain.id as typeof SUPPORTED_CHAINS[keyof typeof SUPPORTED_CHAINS]);
                            setToToken(newTokenList[0]);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                            destChainId === chain.id ? 'bg-white/5' : ''
                          }`}
                        >
                          <ChainIcon chainId={chain.id} className="w-6 h-6" />
                          <span className="font-medium">{chain.name}</span>
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

              {/* From Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">From (Sepolia)</label>
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
                      {fromTokenList.filter(
                        (t) => t.address.toLowerCase() !== toToken.address.toLowerCase()
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
                              balances[token.symbol] || BigInt(0),
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
                  <label className="text-sm text-muted">
                    To ({CHAIN_NAMES[destChainId]})
                  </label>
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
                      {toTokenList.filter(
                        (t) => t.address.toLowerCase() !== fromToken.address.toLowerCase()
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
                          <div className="ml-auto text-sm text-muted">
                            {formatTokenAmount(
                              balances[token.symbol] || BigInt(0),
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

              {/* Swap Details */}
              {quote && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Destination</span>
                    <span className="font-medium text-[hsl(var(--pink))]">
                      {CHAIN_NAMES[destChainId]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Bridge Fee</span>
                    <span className="font-medium">
                      {formatTokenAmount(quote.bridgeFee, fromToken.decimals, 6)} {fromToken.symbol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Est. Time</span>
                    <span className="font-medium">
                      {formatDuration(quote.estimatedDuration)}
                    </span>
                  </div>
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
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Min. Received</span>
                    <span className="font-medium">
                      {formatTokenAmount(quote.minimumReceived, toToken.decimals, 6)}{' '}
                      {toToken.symbol}
                    </span>
                  </div>
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

              {/* Cross-chain indicator */}
              {isCrossChain && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--pink))]/20 bg-[hsl(var(--pink))]/5">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-[hsl(var(--pink))]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span className="text-sm font-medium">Cross-Chain</span>
                  </div>
                  <span className="text-xs text-muted">
                    Tokens will be bridged
                  </span>
                </div>
              )}

              {/* Transaction Progress */}
              {isSwapping && (
                <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />
                    <span className="text-sm">{progress.message}</span>
                  </div>

                  {progress.bridgeTxHash && (
                    <div className="flex items-center justify-between text-xs text-muted pt-1 border-t border-white/5">
                      <span>Source TX:</span>
                      <a
                        href={getExplorerLink(progress.bridgeTxHash, fromChainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline hover:text-white"
                      >
                        {progress.bridgeTxHash.slice(0, 10)}...
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Success Message */}
              {progress.step === 'complete' && progress.bridgeTxHash && (
                <div className="space-y-2 p-3 rounded-xl border border-green-500/20 bg-green-500/10">
                  <div className="flex items-center justify-between">
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
                        {isCrossChain
                          ? 'Cross-chain operation initiated!'
                          : 'Swap complete!'}
                      </span>
                    </div>
                    <a
                      href={getExplorerLink(progress.bridgeTxHash, fromChainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-500 hover:underline"
                    >
                      View TX
                    </a>
                  </div>
                  {isCrossChain && (
                    <p className="text-xs text-green-400/70">
                      Your tokens are being bridged. This may take a few minutes.
                    </p>
                  )}
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
