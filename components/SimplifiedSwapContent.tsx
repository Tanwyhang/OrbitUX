'use client';

/**
 * Simplified Swap Content with Auto-Detection
 * Automatically detects operation type:
 * - Same chain, different token → Swap
 * - Different chain, same token → Bridge
 * - Different chain, different token → Bridge + Swap
 *
 * Supported: Arbitrum ↔ Polygon
 * Tokens: USDT, ETH
 */

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Eye, EyeOff } from 'lucide-react';
import {
  TokenETH, TokenUSDT,
  NetworkArbitrumOne, NetworkPolygon
} from '@web3icons/react';
import type { ComponentType, SVGProps } from 'react';
import type { TokenConfig, SupportedChainId } from '@/lib/swap/unifiedConfig';
import {
  getTokensForChain,
  getUSDTConfig,
  getETHConfig,
  getChainName,
  getExplorerUrl,
  SUPPORTED_CHAINS,
} from '@/lib/swap/unifiedConfig';
import { useStargateQuote, useStargateBridge, formatBridgeDuration } from '@/hooks/useStargateBridge';
import { useComposeQuote, useStargateCompose } from '@/hooks/useStargateCompose';
import { useUniswapQuote } from '@/hooks/useUniswapQuote';
import { useUniswapSwap } from '@/hooks/useUniswapSwap';
import { useUnifiedTokenBalances } from '@/hooks/useUnifiedTokenBalances';
import { usePrivateSwap } from '@/hooks/usePrivateSwap';
import { usePrivateBridge } from '@/hooks/usePrivateBridge';
import { useRailgunWallet } from '@/hooks/useRailgunWallet';
import { useStealthMode } from './contexts/StealthModeContext';
import SlippageSettings, { useSlippageStorage } from './SlippageSettings';
import WalletSetup from './WalletSetup';

// ============================================================================
// Icon Types
// ============================================================================

type Web3IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { variant?: 'branded' | 'mono'; className?: string }
>;

const CHAIN_ICONS: Record<number, Web3IconComponent> = {
  [SUPPORTED_CHAINS.ARBITRUM]: NetworkArbitrumOne,
  [SUPPORTED_CHAINS.POLYGON]: NetworkPolygon,
};

const TOKEN_ICONS: Record<string, Web3IconComponent> = {
  ETH: TokenETH,
  USDT: TokenUSDT,
};

// ============================================================================
// Helper Components
// ============================================================================

function ChainIcon({ chainId, className }: { chainId: number; className?: string }) {
  const Icon = CHAIN_ICONS[chainId];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

function TokenIcon({ symbol, className }: { symbol: string; className?: string }) {
  const Icon = TOKEN_ICONS[symbol];
  return Icon ? <Icon variant="branded" className={className} /> : null;
}

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

// ============================================================================
// Operation Types (Auto-detected)
// ============================================================================

type OperationType = 'swap' | 'bridge' | 'compose';

// ============================================================================
// Main Component
// ============================================================================

export default function SimplifiedSwapContent() {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { stealthMode: privateMode, toggleStealthMode: setPrivateMode } = useStealthMode();

  // Use current chain if supported, default to Arbitrum
  const supportedChainId: SupportedChainId = Object.values(SUPPORTED_CHAINS).includes(currentChainId as any)
    ? (currentChainId as SupportedChainId)
    : SUPPORTED_CHAINS.ARBITRUM;

  // All chain options
  const ALL_CHAIN_OPTIONS = [
    { id: SUPPORTED_CHAINS.ARBITRUM, name: 'Arbitrum' },
    { id: SUPPORTED_CHAINS.POLYGON, name: 'Polygon' },
  ];

  // From selections - start with current chain and USDT
  const [selectedFromChain, setSelectedFromChain] = useState<SupportedChainId>(supportedChainId);
  const [selectedFromToken, setSelectedFromToken] = useState<TokenConfig>(getUSDTConfig(supportedChainId));

  // To selections - start with current chain and ETH (for swap)
  const [selectedToChain, setSelectedToChain] = useState<SupportedChainId>(supportedChainId);
  const [selectedToToken, setSelectedToToken] = useState<TokenConfig>(getETHConfig(supportedChainId));

  // Amount input
  const [fromAmount, setFromAmount] = useState('');

  // Destination delivery option (public or private)
  const [destinationDelivery, setDestinationDelivery] = useState<'public' | 'private'>('private');

  // Slippage settings
  const [slippage, setSlippage] = useSlippageStorage();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [showWalletSetup, setShowWalletSetup] = useState(false);

  // Dropdown visibility
  const [showFromChainDropdown, setShowFromChainDropdown] = useState(false);
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);
  const [showToChainDropdown, setShowToChainDropdown] = useState(false);
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false);

  // Hooks
  const { balances, refetch: refetchBalances } = useUnifiedTokenBalances();
  const { status: railgunWalletStatus, wallet: railgunWallet } = useRailgunWallet();

  // Private swap hook (only used for same-chain swaps in private mode)
  const { executePrivateSwap, progress: privateProgress, isSwapping: isPrivateSwapping, reset: resetPrivate } = usePrivateSwap();

  // Private bridge hook (used for cross-chain operations in private mode)
  const { executePrivateBridge, progress: privateBridgeProgress, isBridging: isPrivateBridging, reset: resetPrivateBridge } = usePrivateBridge();

  // Get token lists for each chain
  const fromTokenList = useMemo(() => getTokensForChain(selectedFromChain), [selectedFromChain]);
  const toTokenList = useMemo(() => getTokensForChain(selectedToChain), [selectedToChain]);

  // Auto-detect operation type based on selections
  const operationType: OperationType = useMemo(() => {
    const sameChain = selectedFromChain === selectedToChain;
    const sameToken = selectedFromToken.symbol === selectedToToken.symbol;

    if (sameChain && !sameToken) {
      return 'swap'; // Same chain, different token
    } else if (!sameChain && sameToken) {
      return 'bridge'; // Different chain, same token
    } else if (!sameChain && !sameToken) {
      return 'compose'; // Different chain, different token
    }
    return 'swap'; // Default (shouldn't happen)
  }, [selectedFromChain, selectedToChain, selectedFromToken.symbol, selectedToToken.symbol]);

  // Update tokens when chain changes to valid tokens
  useEffect(() => {
    const chainTokens = getTokensForChain(selectedFromChain);
    const usdtToken = chainTokens.find(t => t.symbol === 'USDT');
    if (usdtToken && selectedFromToken.symbol !== 'USDT') {
      setSelectedFromToken(usdtToken);
    } else if (!usdtToken && chainTokens.length > 0) {
      setSelectedFromToken(chainTokens[0]);
    }
  }, [selectedFromChain]);

  useEffect(() => {
    const chainTokens = getTokensForChain(selectedToChain);
    const ethToken = chainTokens.find(t => t.symbol === 'ETH');
    if (ethToken && selectedToToken.symbol !== 'ETH') {
      setSelectedToToken(ethToken);
    } else if (!ethToken && chainTokens.length > 0) {
      setSelectedToToken(chainTokens[0]);
    }
  }, [selectedToChain]);

  // Quotes based on operation type
  const isSameChain = operationType === 'swap';
  const isBridgeOnly = operationType === 'bridge';
  const isCompose = operationType === 'compose';

  // Uniswap quote (for same-chain swaps)
  // Private mode uses the same quote but executes differently
  const { quote: uniswapQuote, isLoading: isQuoteLoading, error: quoteError } = useUniswapQuote({
    fromToken: selectedFromToken,
    toToken: selectedToToken,
    inputAmount: fromAmount,
    slippage,
    enabled: isConnected && isSameChain,
  });

  // Stargate quote (for bridge only)
  const { quote: stargateQuote, isLoading: isBridgeQuoteLoading, error: bridgeQuoteError } = useStargateQuote({
    fromChainId: selectedFromChain,
    toChainId: selectedToChain,
    inputAmount: fromAmount,
    slippage,
    enabled: isConnected && isBridgeOnly,
  });

  // Compose quote (for bridge + swap)
  const { quote: composeQuote, isLoading: isComposeQuoteLoading, error: composeQuoteError } = useComposeQuote({
    fromChainId: selectedFromChain,
    toChainId: selectedToChain,
    inputAmount: fromAmount,
    slippage,
    enabled: isConnected && isCompose,
  });

  // Execution hooks
  const { executeSwap: executeUniswap, progress: uniswapProgress, isSwapping: isUniswapSwapping, reset: resetUniswap } = useUniswapSwap();
  const { executeBridge: executeStargateBridge, progress: stargateProgress, isBridging } = useStargateBridge();
  const { executeCompose, progress: composeProgress, isComposing } = useStargateCompose();

  // Get output amounts based on operation type
  const outputAmount = useMemo(() => {
    if (isSameChain && uniswapQuote) {
      return formatTokenAmount(uniswapQuote.outputAmount, selectedToToken.decimals, 6);
    }
    if (isBridgeOnly && stargateQuote) {
      return formatTokenAmount(stargateQuote.amountOut, selectedToToken.decimals, 6);
    }
    if (isCompose && composeQuote) {
      return formatTokenAmount(composeQuote.expectedSwapOutput, 18, 6); // ETH has 18 decimals
    }
    return '';
  }, [isSameChain, isBridgeOnly, isCompose, uniswapQuote, stargateQuote, composeQuote, selectedToToken.decimals]);

  // Get balances
  const fromBalance = formatTokenAmount(balances[selectedFromToken.symbol] || BigInt(0), selectedFromToken.decimals, 4);
  const toBalance = formatTokenAmount(balances[selectedToToken.symbol] || BigInt(0), selectedToToken.decimals, 4);

  // Check balance
  const insufficientBalance = (() => {
    if (!fromAmount || fromAmount === '') return false;
    const inputParsed = parseFloat(fromAmount);
    const balanceParsed = parseFloat(fromBalance);
    return inputParsed > balanceParsed;
  })();

  // Unified progress - now includes private bridge support
  const isPrivateBridge = !isSameChain && privateMode;
  const progress = isPrivateBridge
    ? privateBridgeProgress
    : isSameChain
      ? (privateMode ? privateProgress : uniswapProgress)
      : isBridgeOnly
        ? stargateProgress
        : composeProgress;
  const isExecuting = isPrivateBridge
    ? isPrivateBridging
    : isSameChain
      ? (privateMode ? isPrivateSwapping : isUniswapSwapping)
      : isBridgeOnly
        ? isBridging
        : isComposing;

  // Handle max click
  const handleMaxClick = () => {
    setFromAmount(fromBalance);
  };

  // Handle execution
  const handleExecute = async () => {
    if (!address) return;

    if (isSameChain && uniswapQuote) {
      if (privateMode) {
        // Use private swap (RAILGUN)
        const result = await executePrivateSwap(uniswapQuote);
        if (result.success) {
          refetchBalances();
          setFromAmount('');
          resetPrivate();
        }
      } else {
        // Use public swap (Uniswap)
        const result = await executeUniswap(uniswapQuote);
        if (result.success) {
          refetchBalances();
          setFromAmount('');
          resetUniswap();
        }
      }
    } else if (isPrivateBridge && (stargateQuote || composeQuote)) {
      // Use private bridge (RAILGUN + Stargate with destination shielding)
      const bridgeRequest = {
        senderWalletID: railgunWallet!.walletID,
        senderEncryptionKey: railgunWallet!.encryptionKey,
        senderRailgunAddress: railgunWallet!.railgunAddress,
        userAddress: address,
        sourceChainId: selectedFromChain,
        inputTokenAddress: selectedFromToken.address,
        inputAmount: fromAmount,
        inputTokenDecimals: selectedFromToken.decimals,
        destinationChainId: selectedToChain,
        outputTokenAddress: isCompose ? selectedToToken.address : undefined,
        minimumOutput: undefined, // Will be calculated by the service
        mode: isBridgeOnly ? ('bridge_only' as const) : ('bridge_and_swap' as const),
        destinationDelivery: destinationDelivery,
        slippage,
      };
      const result = await executePrivateBridge(bridgeRequest);
      if (result.success) {
        refetchBalances();
        setFromAmount('');
        resetPrivateBridge();
      }
    } else if (isBridgeOnly && stargateQuote) {
      const result = await executeStargateBridge(stargateQuote);
      if (result.success) {
        refetchBalances();
        setFromAmount('');
      }
    } else if (isCompose && composeQuote) {
      const result = await executeCompose(composeQuote);
      if (result.success) {
        refetchBalances();
        setFromAmount('');
      }
    }
  };

  // Get button state
  const getButtonState = (): { text: string; disabled: boolean } => {
    if (!isConnected) {
      return { text: 'Connect Wallet', disabled: true };
    }
    if (isExecuting) {
      return { text: progress?.message || 'Processing...', disabled: true };
    }
    if (!fromAmount || fromAmount === '' || parseFloat(fromAmount) === 0) {
      return { text: 'Enter Amount', disabled: true };
    }
    if (insufficientBalance) {
      return { text: `Insufficient ${selectedFromToken.symbol}`, disabled: true };
    }
    // Check for private mode requirements
    if (privateMode && railgunWalletStatus !== 'ready') {
      return {
        text: railgunWalletStatus === 'creating' ? 'Creating RAILGUN Wallet...' : 'RAILGUN Wallet Required',
        disabled: true
      };
    }
    if ((isSameChain && isQuoteLoading) || (isBridgeOnly && isBridgeQuoteLoading) || (isCompose && isComposeQuoteLoading)) {
      return { text: 'Fetching Quote...', disabled: true };
    }
    if ((isSameChain && quoteError) || (isBridgeOnly && bridgeQuoteError) || (isCompose && composeQuoteError)) {
      return { text: 'No Route Available', disabled: true };
    }
    if ((isSameChain && !uniswapQuote) || (isBridgeOnly && !stargateQuote) || (isCompose && !composeQuote)) {
      return { text: 'Enter Amount', disabled: true };
    }

    // Dynamic button text
    if (isSameChain) {
      return {
        text: privateMode
          ? `Private Swap ${selectedFromToken.symbol} → ${selectedToToken.symbol}`
          : `Swap ${selectedFromToken.symbol} → ${selectedToToken.symbol}`,
        disabled: false
      };
    } else if (isBridgeOnly) {
      return {
        text: privateMode
          ? `Private Bridge to ${getChainName(selectedToChain)}`
          : `Bridge ${selectedFromToken.symbol} to ${getChainName(selectedToChain)}`,
        disabled: false
      };
    } else {
      return {
        text: privateMode
          ? `Private Bridge & Swap to ${getChainName(selectedToChain)}`
          : `Bridge & Swap to ${getChainName(selectedToChain)}`,
        disabled: false
      };
    }
  };

  const buttonState = getButtonState();

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFromChainDropdown(false);
      setShowFromTokenDropdown(false);
      setShowToChainDropdown(false);
      setShowToTokenDropdown(false);
    };

    if (showFromChainDropdown || showFromTokenDropdown || showToChainDropdown || showToTokenDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFromChainDropdown, showFromTokenDropdown, showToChainDropdown, showToTokenDropdown]);

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 backdrop-blur p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Simple Swap</h3>
                <p className="text-xs text-muted">
                  Auto-detects: Swap, Bridge, or Bridge + Swap
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Private Mode Toggle - available for all operations */}
                <button
                  onClick={() => setPrivateMode(!privateMode)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all duration-300 ease-in-out ${
                    privateMode
                      ? 'border-[hsl(var(--pink))]/50 bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]'
                      : 'border-white/10 bg-black/30 text-white/60 hover:bg-white/5'
                  }`}
                  title="Toggle private mode"
                >
                  {privateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span className="text-xs font-medium">{privateMode ? 'Private' : 'Public'}</span>
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors duration-300 ease-in-out ${
                      privateMode ? 'bg-[hsl(var(--pink))]' : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out ${
                        privateMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
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

            {/* Slippage Settings */}
            {showSlippageSettings && (
              <div className="mb-4">
                <SlippageSettings
                  value={slippage}
                  onChange={setSlippage}
                  onClose={() => setShowSlippageSettings(false)}
                />
              </div>
            )}

            {/* Private Mode Wallet Warning */}
            {privateMode && railgunWalletStatus !== 'ready' && (
              <div className="mb-4 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm text-yellow-500 mb-2">
                      {railgunWalletStatus === 'none' || railgunWalletStatus === 'error'
                        ? 'RAILGUN wallet required for private mode.'
                        : 'Creating RAILGUN wallet...'}
                    </p>
                    {railgunWalletStatus === 'none' || railgunWalletStatus === 'error' ? (
                      <button
                        onClick={() => setShowWalletSetup(true)}
                        className="px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30 text-xs font-medium transition-all"
                      >
                        Create Wallet
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* From Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">From</label>
                  <span className="text-xs text-muted">Balance: {fromBalance} {selectedFromToken.symbol}</span>
                </div>

                {/* Single row: Input | MAX | Token | Chain */}
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                  {/* Amount Input */}
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

                  {/* MAX Button */}
                  <button
                    onClick={handleMaxClick}
                    className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-muted hover:text-white"
                  >
                    MAX
                  </button>

                  {/* Token Dropdown - Icon only */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFromTokenDropdown(!showFromTokenDropdown);
                        setShowFromChainDropdown(false);
                        setShowToTokenDropdown(false);
                        setShowToChainDropdown(false);
                      }}
                      className="flex items-center justify-center px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <TokenIcon symbol={selectedFromToken.symbol} className="w-6 h-6" />
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showFromTokenDropdown && (
                      <div className="absolute top-full right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-30 min-w-[180px]">
                        {fromTokenList.map((token) => (
                          <button
                            key={token.symbol}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFromToken(token);
                              setShowFromTokenDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                              selectedFromToken.symbol === token.symbol ? 'bg-white/5' : ''
                            }`}
                          >
                            <TokenIcon symbol={token.symbol} className="w-5 h-5" />
                            <div className="flex-1 text-left">
                              <div className="text-sm font-medium">{token.symbol}</div>
                              <div className="text-xs text-muted">{token.name}</div>
                            </div>
                            <div className="text-xs text-muted">
                              {formatTokenAmount(balances[token.symbol] || BigInt(0), token.decimals, 4)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chain Dropdown - Icon only */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFromChainDropdown(!showFromChainDropdown);
                        setShowFromTokenDropdown(false);
                        setShowToTokenDropdown(false);
                        setShowToChainDropdown(false);
                      }}
                      className="flex items-center justify-center px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <ChainIcon chainId={selectedFromChain} className="w-6 h-6" />
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showFromChainDropdown && (
                      <div className="absolute top-full right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-30 min-w-[140px]">
                        {ALL_CHAIN_OPTIONS.map((chain) => (
                          <button
                            key={chain.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFromChain(chain.id as SupportedChainId);
                              setShowFromChainDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                              selectedFromChain === chain.id ? 'bg-white/5' : ''
                            }`}
                          >
                            <ChainIcon chainId={chain.id} className="w-5 h-5" />
                            <span className="text-sm font-medium">{chain.name}</span>
                            {selectedFromChain === chain.id && (
                              <svg className="w-4 h-4 ml-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center -my-2 relative z-10">
                <button className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              </div>

              {/* To Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted">To</label>
                  {!isSameChain && (
                    <span className="text-xs text-muted">Balance: {toBalance} {selectedToToken.symbol}</span>
                  )}
                </div>

                {/* Single row: Output | Token | Chain */}
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                  {/* Output Display */}
                  <div className="flex-1">
                    <div className="text-2xl font-semibold text-muted">
                      {(isSameChain && isQuoteLoading) || (isBridgeOnly && isBridgeQuoteLoading) || (isCompose && isComposeQuoteLoading) ? (
                        <span className="animate-pulse">...</span>
                      ) : outputAmount ? (
                        <span className="text-white">{outputAmount}</span>
                      ) : (
                        '0.00'
                      )}
                    </div>
                  </div>

                  {/* Token Dropdown - Icon only */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowToTokenDropdown(!showToTokenDropdown);
                        setShowToChainDropdown(false);
                        setShowFromTokenDropdown(false);
                        setShowFromChainDropdown(false);
                      }}
                      className="flex items-center justify-center px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <TokenIcon symbol={selectedToToken.symbol} className="w-6 h-6" />
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showToTokenDropdown && (
                      <div className="absolute top-full right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-30 min-w-[180px]">
                        {toTokenList.map((token) => (
                          <button
                            key={token.symbol}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedToToken(token);
                              setShowToTokenDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                              selectedToToken.symbol === token.symbol ? 'bg-white/5' : ''
                            }`}
                          >
                            <TokenIcon symbol={token.symbol} className="w-5 h-5" />
                            <div className="flex-1 text-left">
                              <div className="text-sm font-medium">{token.symbol}</div>
                              <div className="text-xs text-muted">{token.name}</div>
                            </div>
                            <div className="text-xs text-muted">
                              {formatTokenAmount(balances[token.symbol] || BigInt(0), token.decimals, 4)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chain Dropdown - Icon only */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowToChainDropdown(!showToChainDropdown);
                        setShowToTokenDropdown(false);
                        setShowFromTokenDropdown(false);
                        setShowFromChainDropdown(false);
                      }}
                      className="flex items-center justify-center px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <ChainIcon chainId={selectedToChain} className="w-6 h-6" />
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showToChainDropdown && (
                      <div className="absolute top-full right-0 mt-2 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-2 space-y-1 z-30 min-w-[140px]">
                        {ALL_CHAIN_OPTIONS.map((chain) => (
                          <button
                            key={chain.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedToChain(chain.id as SupportedChainId);
                              setShowToChainDropdown(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-left ${
                              selectedToChain === chain.id ? 'bg-white/5' : ''
                            }`}
                          >
                            <ChainIcon chainId={chain.id} className="w-5 h-5" />
                            <span className="text-sm font-medium">{chain.name}</span>
                            {selectedToChain === chain.id && (
                              <svg className="w-4 h-4 ml-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Detected Operation Type */}
              <div className="flex items-center justify-center gap-2 py-2 rounded-xl border border-white/10 bg-black/20">
                {isPrivateBridge && (
                  <>
                    <span className="text-lg">🔒🌉</span>
                    <span className="text-sm font-medium text-pink-400">Private Bridge</span>
                    <span className="text-xs text-muted">End-to-end privacy ({destinationDelivery})</span>
                  </>
                )}
                {isSameChain && privateMode && !isPrivateBridge && (
                  <>
                    <span className="text-lg">🔒</span>
                    <span className="text-sm font-medium text-pink-400">Private Swap</span>
                    <span className="text-xs text-muted">RAILGUN privacy enabled</span>
                  </>
                )}
                {isSameChain && !privateMode && (
                  <>
                    <span className="text-lg">🔄</span>
                    <span className="text-sm font-medium text-blue-400">Swap</span>
                    <span className="text-xs text-muted">Same chain, different token</span>
                  </>
                )}
                {isBridgeOnly && !privateMode && (
                  <>
                    <span className="text-lg">🌉</span>
                    <span className="text-sm font-medium text-purple-400">Bridge</span>
                    <span className="text-xs text-muted">Different chain, same token</span>
                  </>
                )}
                {isCompose && !privateMode && (
                  <>
                    <span className="text-lg">✨</span>
                    <span className="text-sm font-medium text-pink-400">Bridge + Swap</span>
                    <span className="text-xs text-muted">Different chain, different token</span>
                  </>
                )}
              </div>

              {/* Details */}
              {((isSameChain && uniswapQuote) || (isBridgeOnly && stargateQuote) || (isCompose && composeQuote)) && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2 text-sm">
                  {/* Mode display - show for all operations when private mode is enabled */}
                  {privateMode && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Mode</span>
                      <span className={`font-medium ${privateMode ? 'text-pink-400' : 'text-blue-400'}`}>
                        {isPrivateBridge
                          ? `Private Bridge (${destinationDelivery})`
                          : 'Private (RAILGUN)'}
                      </span>
                    </div>
                  )}

                  {((isBridgeOnly && stargateQuote) || (isCompose && composeQuote)) && !privateMode && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Bridge Fee</span>
                        <span className="font-medium">
                          {formatTokenAmount((stargateQuote || composeQuote)!.bridgeFee, selectedFromToken.decimals, 6)} {selectedFromToken.symbol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Est. Time</span>
                        <span className="font-medium">
                          {formatBridgeDuration((stargateQuote || composeQuote)!.estimatedDuration)}
                          {privateMode && ' + 2-4 min for POI'}
                        </span>
                      </div>
                    </>
                  )}

                  {isSameChain && uniswapQuote && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Price Impact</span>
                        <span className={`font-medium ${uniswapQuote.priceImpact > 1 ? 'text-yellow-400' : ''}`}>
                          {uniswapQuote.priceImpact.toFixed(2)}%
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-muted">Min. Received</span>
                    <span className="font-medium">
                      {isSameChain && uniswapQuote
                        ? `${formatTokenAmount(uniswapQuote.minimumReceived, selectedToToken.decimals, 6)} ${selectedToToken.symbol}`
                        : (isBridgeOnly || isCompose) && (stargateQuote || composeQuote)
                        ? `${formatTokenAmount(
                            isBridgeOnly ? stargateQuote!.minAmountOut : composeQuote!.minAmountOut,
                            isBridgeOnly ? 6 : 18,
                            6
                          )} ${isBridgeOnly ? 'USDT' : 'ETH'}`
                        : '-'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted">Slippage</span>
                    <span className={`font-medium ${slippage > HIGH_SLIPPAGE_THRESHOLD ? 'text-yellow-400' : ''}`}>
                      {slippage}%
                    </span>
                  </div>
                </div>
              )}

              {/* Transaction Progress */}
              {isExecuting && progress && (
                <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />
                    <span className="text-sm">{progress.message}</span>
                  </div>
                  {privateMode && 'progress' in progress && typeof progress.progress === 'number' && (
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div
                        className="bg-pink-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Success Message */}
              {progress && progress.step === 'complete' && (
                <div className="space-y-2 p-3 rounded-xl border border-green-500/20 bg-green-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-green-500">
                        {isPrivateBridge
                          ? 'End-to-end private bridge complete!'
                          : privateMode
                            ? 'Private swap complete!'
                            : isSameChain
                              ? 'Swap complete!'
                              : isBridgeOnly
                                ? 'Bridge initiated!'
                                : 'Bridge & swap initiated!'}
                      </span>
                    </div>
                    {/* Show transaction links based on mode */}
                    {isSameChain && !privateMode && 'txHash' in progress && progress.txHash && (
                      <a
                        href={`${getExplorerUrl(selectedFromChain)}/tx/${progress.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-500 hover:underline"
                      >
                        View TX
                      </a>
                    )}
                  </div>
                  {/* Private mode shows additional TXs */}
                  {privateMode && (
                    <div className="text-xs text-green-400 mt-1 space-y-1">
                      {'inputShieldTxHash' in progress && progress.inputShieldTxHash && (
                        <div>Source Shield: <span className="opacity-70">{progress.inputShieldTxHash.slice(0, 10)}...</span></div>
                      )}
                      {'bridgeTxHash' in progress && progress.bridgeTxHash && (
                        <div>Bridge: <span className="opacity-70">{progress.bridgeTxHash.slice(0, 10)}...</span></div>
                      )}
                      {'destShieldTxHash' in progress && progress.destShieldTxHash && (
                        <div>Dest Shield: <span className="opacity-70">{progress.destShieldTxHash.slice(0, 10)}...</span></div>
                      )}
                      {!isPrivateBridge && 'swapTxHash' in progress && progress.swapTxHash && (
                        <div>Swap: <span className="opacity-70">{progress.swapTxHash.slice(0, 10)}...</span></div>
                      )}
                    </div>
                  )}
                  {!isSameChain && !isPrivateBridge && (
                    <p className="text-xs text-green-400/70">
                      {isBridgeOnly
                        ? `Your ${selectedFromToken.symbol} is being bridged. Switch to ${getChainName(selectedToChain)} to see it.`
                        : 'Your tokens are being bridged and swapped. This takes a few minutes.'}
                    </p>
                  )}
                  {isPrivateBridge && (
                    <p className="text-xs text-green-400/70">
                      {destinationDelivery === 'private'
                        ? `Tokens are now in your private balance on ${getChainName(selectedToChain)}!`
                        : `Tokens delivered to your public address on ${getChainName(selectedToChain)}.`}
                    </p>
                  )}
                </div>
              )}

              {/* Error Message */}
              {progress && progress.step === 'error' && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm text-red-500">
                    {'error' in progress && typeof progress.error === 'string'
                      ? progress.error
                      : progress.error instanceof Error
                        ? progress.error.message
                        : 'Transaction failed'}
                  </span>
                </div>
              )}

              {/* Execute Button */}
              {isConnected ? (
                <button
                  onClick={handleExecute}
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

      {/* Wallet Setup Modal */}
      {showWalletSetup && (
        <WalletSetup
          onComplete={() => {
            setShowWalletSetup(false);
          }}
        />
      )}
    </div>
  );
}
