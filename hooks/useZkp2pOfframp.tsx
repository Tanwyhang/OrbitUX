'use client'

import { useCreateDeposit, useAddFunds, useRemoveFunds, useWithdrawDeposit } from '@zkp2p/sdk/react'
import type { PublicClient } from 'viem'

export interface IntentAmountRange {
  min: bigint
  max: bigint
}

export interface ConversionRate {
  currency: string
  conversionRate: string
}

export type DepositData = Record<string, string>

export interface CreateDepositParams {
  token: `0x${string}`
  amount: bigint
  intentAmountRange: IntentAmountRange
  processorNames: string[]
  depositData: DepositData[]
  conversionRates: ConversionRate[][]
}

export interface AddFundsParams {
  depositId: bigint
  amount: bigint
}

export interface WithdrawDepositParams {
  depositId: bigint
  txOverrides?: any
}

export interface UseZkp2pOfframpReturn {
  createDeposit: (params: CreateDepositParams) => Promise<`0x${string}` | null>
  addFunds: (params: AddFundsParams) => Promise<`0x${string}` | null>
  removeFunds: (depositId: bigint, amount: bigint) => Promise<`0x${string}` | null>
  withdrawDeposit: (params: WithdrawDepositParams) => Promise<`0x${string}` | null>
  isCreatingDeposit: boolean
  isAddingFunds: boolean
  isWithdrawing: boolean
  error: Error | null
}

/**
 * Hook for ZKP2P offramp functionality
 * Handles creating deposits, adding funds, and withdrawing to fiat via processors like Wise
 * @param client - Viem PublicClient for blockchain interactions
 */
export function useZkp2pOfframp(
  client: PublicClient | null
): UseZkp2pOfframpReturn {
  // When client is null, return disabled functions
  if (!client) {
    return {
      createDeposit: async () => { throw new Error('PublicClient not available. Please connect your wallet.') },
      addFunds: async () => { throw new Error('PublicClient not available. Please connect your wallet.') },
      removeFunds: async () => { throw new Error('PublicClient not available. Please connect your wallet.') },
      withdrawDeposit: async () => { throw new Error('PublicClient not available. Please connect your wallet.') },
      isCreatingDeposit: false,
      isAddingFunds: false,
      isWithdrawing: false,
      error: null,
    }
  }

  const { createDeposit: sdkCreateDeposit, isLoading: isCreatingDeposit, error: createError } = useCreateDeposit({ client: client as any })
  const { addFunds: sdkAddFunds, isLoading: isAddingFunds } = useAddFunds({ client: client as any })
  const { removeFunds: sdkRemoveFunds } = useRemoveFunds({ client: client as any })
  const { withdrawDeposit: sdkWithdrawDeposit, isLoading: isWithdrawing } = useWithdrawDeposit({ client: client as any })

  const createDeposit = async (params: CreateDepositParams) => {
    return sdkCreateDeposit(params)
  }

  const addFunds = async (params: AddFundsParams) => {
    return sdkAddFunds(params)
  }

  const removeFunds = async (depositId: bigint, amount: bigint) => {
    return sdkRemoveFunds({ depositId, amount })
  }

  const withdrawDeposit = async (params: WithdrawDepositParams) => {
    return sdkWithdrawDeposit(params)
  }

  return {
    createDeposit,
    addFunds,
    removeFunds,
    withdrawDeposit,
    isCreatingDeposit,
    isAddingFunds,
    isWithdrawing,
    error: createError,
  }
}
