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

export interface DepositData {
  email?: string
  [key: string]: string | undefined
}

export interface CreateDepositParams {
  token: string
  amount: bigint
  intentAmountRange: IntentAmountRange
  processorNames: string[]
  depositData: DepositData[]
  conversionRates: ConversionRate[][]
}

export interface AddFundsParams {
  depositHash: string
  token: string
  amount: bigint
}

export interface WithdrawDepositParams {
  depositHash: string
  processorIndex: number
  fulfillmentData: Record<string, string>[]
}

export interface UseZkp2pOfframpReturn {
  createDeposit: (params: CreateDepositParams) => Promise<{ hash: string }>
  addFunds: (params: AddFundsParams) => Promise<{ hash: string }>
  removeFunds: (depositHash: string, token: string, amount: bigint) => Promise<{ hash: string }>
  withdrawDeposit: (params: WithdrawDepositParams) => Promise<{ hash: string }>
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
  const { createDeposit: sdkCreateDeposit, isLoading: isCreatingDeposit, error: createError } = useCreateDeposit({ client })
  const { addFunds: sdkAddFunds, isLoading: isAddingFunds } = useAddFunds({ client })
  const { removeFunds: sdkRemoveFunds } = useRemoveFunds({ client })
  const { withdrawDeposit: sdkWithdrawDeposit, isLoading: isWithdrawing } = useWithdrawDeposit({ client })

  const createDeposit = async (params: CreateDepositParams) => {
    if (!client) {
      throw new Error('PublicClient not available. Please connect your wallet.')
    }
    return sdkCreateDeposit(params)
  }

  const addFunds = async (params: AddFundsParams) => {
    if (!client) {
      throw new Error('PublicClient not available. Please connect your wallet.')
    }
    return sdkAddFunds(params)
  }

  const removeFunds = async (depositHash: string, token: string, amount: bigint) => {
    if (!client) {
      throw new Error('PublicClient not available. Please connect your wallet.')
    }
    return sdkRemoveFunds({ depositHash, token, amount })
  }

  const withdrawDeposit = async (params: WithdrawDepositParams) => {
    if (!client) {
      throw new Error('PublicClient not available. Please connect your wallet.')
    }
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
