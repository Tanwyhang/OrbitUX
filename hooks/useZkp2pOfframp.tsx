'use client'

import { useCreateDeposit, useAddFunds, useRemoveFunds, useWithdrawDeposit } from '@zkp2p/sdk/react'

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
  token: `0x${string}`
  amount: bigint
  intentAmountRange: IntentAmountRange
  processorNames: string[]
  depositData: { [key: string]: string }[]
  conversionRates: ConversionRate[][]
}

export interface AddFundsParams {
  depositId: bigint
  amount: bigint
}

export interface WithdrawDepositParams {
  depositId: bigint
}

export interface UseZkp2pOfframpReturn {
  createDeposit: (params: CreateDepositParams) => Promise<string | null>
  addFunds: (params: AddFundsParams) => Promise<string | null>
  removeFunds: (depositId: bigint, amount: bigint) => Promise<string | null>
  withdrawDeposit: (params: WithdrawDepositParams) => Promise<string | null>
  isCreatingDeposit: boolean
  isAddingFunds: boolean
  isWithdrawing: boolean
  error: Error | null
}

/**
 * Hook for ZKP2P offramp functionality
 * Handles creating deposits, adding funds, and withdrawing to fiat via processors like Wise
 * @param client - Zkp2pClient for blockchain interactions
 */
export function useZkp2pOfframp(
  client: any
): UseZkp2pOfframpReturn {
  const { createDeposit: sdkCreateDeposit, isLoading: isCreatingDeposit, error: createError } = useCreateDeposit({ client })
  const { addFunds: sdkAddFunds, isLoading: isAddingFunds } = useAddFunds({ client })
  const { removeFunds: sdkRemoveFunds } = useRemoveFunds({ client })
  const { withdrawDeposit: sdkWithdrawDeposit, isLoading: isWithdrawing } = useWithdrawDeposit({ client })

  const createDeposit = async (params: CreateDepositParams): Promise<string | null> => {
    if (!client) {
      throw new Error('Client not available. Please connect your wallet.')
    }
    return sdkCreateDeposit(params as any)
  }

  const addFunds = async (params: AddFundsParams): Promise<string | null> => {
    if (!client) {
      throw new Error('Client not available. Please connect your wallet.')
    }
    return sdkAddFunds(params)
  }

  const removeFunds = async (depositId: bigint, amount: bigint): Promise<string | null> => {
    if (!client) {
      throw new Error('Client not available. Please connect your wallet.')
    }
    return sdkRemoveFunds({ depositId, amount })
  }

  const withdrawDeposit = async (params: WithdrawDepositParams): Promise<string | null> => {
    if (!client) {
      throw new Error('Client not available. Please connect your wallet.')
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
