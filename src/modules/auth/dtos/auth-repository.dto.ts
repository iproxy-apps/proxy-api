import { Prisma } from '@prisma/client'

type UsersCreateInput = Prisma.UsersCreateInput
import { FindUserByEmailResult } from '../types'

export interface AuthRepositoryDTO {
  findByEmail: (email: string) => Promise<FindUserByEmailResult | null>
  create: (data: UsersCreateInput) => Promise<UsersCreateInput>
  findUserStripeCustomerId: (userId: string) => Promise<string | null>
  fetchUserDetailsById: (
    userId: string,
  ) => Promise<FindUserByEmailResult | null>
  updateTotalTasksCompleted: (
    userId: string,
    totalTasksCompleted: number,
  ) => Promise<void>
  updateTotalTasksCreated: (
    userId: string,
    totalTasksCreated: number,
  ) => Promise<void>
  updateWalletBalance: (userId: string, walletBalance: number) => Promise<void>
  updateStripeAccountId: (
    userId: string,
    stripeAccountId: string,
  ) => Promise<void>
  fetchTasksCreatedByUser: (userId: string) => Promise<TransactionHistoryTask[]>
  fetchTasksCompletedByUser: (
    userId: string,
  ) => Promise<TransactionHistoryTask[]>
}

export type TransactionHistoryTask = {
  id: string
  title: string
  description: string
  offeredPrice: Prisma.Decimal
  status: string
  createdAt: Date
  completedAt: Date | null
}
