import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'

import type { TransactionHistoryTask } from '../dtos/auth-repository.dto'

type CompletedTaskWithNetAmount = TransactionHistoryTask & {
  netAmount: number
}

type FetchTransactionHistoryResponse = {
  tasksCreated: TransactionHistoryTask[]
  tasksCompleted: CompletedTaskWithNetAmount[]
}

@Injectable()
export class FetchTransactionHistoryService {
  constructor(
    private authRepository: AuthRepository,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(userId: string): Promise<FetchTransactionHistoryResponse> {
    const userDetails = await this.fetchUserDetailsService.execute(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    const [tasksCreated, tasksCompletedRaw] = await Promise.all([
      this.authRepository.fetchTasksCreatedByUser(userId),
      this.authRepository.fetchTasksCompletedByUser(userId),
    ])

    // offeredPrice - stripe fee (3.99% + R$ 0.39) - platform fee (20%)
    const tasksCompleted: CompletedTaskWithNetAmount[] = tasksCompletedRaw.map(
      (task) => {
        const price = Number(task.offeredPrice)
        const stripeFee = price * 0.0399 + 0.39
        const platformFee = price * 0.2
        const netAmount = +(price - stripeFee - platformFee).toFixed(2)

        return { ...task, netAmount }
      },
    )

    return { tasksCreated, tasksCompleted }
  }
}
