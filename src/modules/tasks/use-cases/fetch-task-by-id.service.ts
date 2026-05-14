import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { FetchTasksResult } from '../types'
import type { PaymentRecord } from 'src/modules/payments/types'

type FetchTaskByIdResult = FetchTasksResult & {
  payment: PaymentRecord | null
}

@Injectable()
export class FetchTaskByIdService {
  constructor(
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
  ) {}

  async execute(taskId: string): Promise<FetchTaskByIdResult> {
    const task = await this.tasksRepository.fetchTaskById({ taskId })
    if (!task) throw new AppException(errorDictionary.tasks.taskNotFound)

    const payment = await this.paymentsRepository.fetchPaymentRecord(taskId)
    return { ...task, payment }
  }
}
