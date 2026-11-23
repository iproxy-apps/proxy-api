import { Prisma } from '@prisma/client'

type UsersCreateInput = Prisma.UsersCreateInput
import { FindUserByEmailResult } from '../types'

export interface AuthRepositoryDTO {
  findByEmail: (email: string) => Promise<FindUserByEmailResult | null>
  create: (data: UsersCreateInput) => Promise<{ id: string }>
  updateStripeCustomerId: (
    userId: string,
    stripeCustomerId: string,
  ) => Promise<void>
  hardDeleteUser: (userId: string) => Promise<void>
  findUserStripeCustomerId: (userId: string) => Promise<string | null>
  fetchUserDetailsById: (
    userId: string,
  ) => Promise<FindUserByEmailResult | null>
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
