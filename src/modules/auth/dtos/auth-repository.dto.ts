import { Prisma } from '@prisma/client'

import type { TaskStatus } from '@prisma/client'

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
  deleteAccount: (userId: string) => Promise<DeleteAccountResult>
}

export const DELETION_BLOCKING_STATUSES: TaskStatus[] = [
  'in_progress',
  'verification_required',
]

export type DeleteAccountResult =
  | { status: 'blocked' }
  | { status: 'already_deleted' }
  | {
      status: 'deleted'
      stripeCardIds: string[]
      stripeCustomerId: string | null
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
