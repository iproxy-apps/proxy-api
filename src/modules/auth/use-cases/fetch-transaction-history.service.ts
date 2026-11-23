import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'

import type { TaskStatus } from '@prisma/client'
import type { HistoryTaskRow } from '../dtos/auth-repository.dto'

export const HISTORY_PER_PAGE = 20

export type TaskSummary = {
  id: string
  title: string
  status: TaskStatus
  city: string
  offeredPrice: number
  netAmount: number
  createdAt: Date
  completedAt: Date | null
  canceledAt: Date | null
}

export type TransactionHistoryResponse = {
  tasksCreated: TaskSummary[]
  tasksCompleted: TaskSummary[]
  page: number
  perPage: number
  hasMore: boolean
}

// netAmount is what actually moved, read from the stored Decimals (never recomputed)
export const toTaskSummary = (
  row: HistoryTaskRow,
  role: 'owner' | 'executor',
): TaskSummary => {
  let netAmount = 0
  if (role === 'executor') {
    netAmount =
      row.status === 'canceled' ? 0 : (row.proxyEarnings?.toNumber() ?? 0)
  } else if (row.status === 'completed') {
    netAmount = (row.chargedAmount ?? row.offeredPrice).toNumber()
  }

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    city: row.city,
    offeredPrice: row.offeredPrice.toNumber(),
    netAmount,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    canceledAt: row.canceledAt,
  }
}

@Injectable()
export class FetchTransactionHistoryService {
  constructor(
    private authRepository: AuthRepository,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(
    userId: string,
    page: number,
  ): Promise<TransactionHistoryResponse> {
    const userDetails = await this.fetchUserDetailsService.execute(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    const pageArgs = {
      skip: (page - 1) * HISTORY_PER_PAGE,
      take: HISTORY_PER_PAGE + 1,
    }

    const [createdRows, executedRows] = await Promise.all([
      this.authRepository.fetchTasksCreatedByUser(userId, pageArgs),
      this.authRepository.fetchTasksExecutedByUser(userId, pageArgs),
    ])

    return {
      tasksCreated: createdRows
        .slice(0, HISTORY_PER_PAGE)
        .map((row) => toTaskSummary(row, 'owner')),
      tasksCompleted: executedRows
        .slice(0, HISTORY_PER_PAGE)
        .map((row) => toTaskSummary(row, 'executor')),
      page,
      perPage: HISTORY_PER_PAGE,
      hasMore:
        createdRows.length > HISTORY_PER_PAGE ||
        executedRows.length > HISTORY_PER_PAGE,
    }
  }
}
