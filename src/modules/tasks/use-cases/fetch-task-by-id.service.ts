import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { FetchTasksResult, TaskCounterpart } from '../types'
import type { PaymentRecord } from 'src/modules/payments/types'

type FetchTaskByIdResult = FetchTasksResult & {
  payment: PaymentRecord | null
  executorId: string | null
  executor: TaskCounterpart | null
}

type Requester = {
  userId: string
  userType: string
}

@Injectable()
export class FetchTaskByIdService {
  constructor(
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
  ) {}

  async execute(
    taskId: string,
    requester: Requester,
  ): Promise<FetchTaskByIdResult> {
    const task = await this.tasksRepository.fetchTaskById({ taskId })
    if (!task) throw new AppException(errorDictionary.tasks.taskNotFound)

    // Clients only see their own tasks. Proxies may look at any task (they
    // need to inspect available jobs before accepting). Return 404 for a
    // non-owner Client so we don't leak the task's existence.
    if (requester.userType === 'CLIENT' && task.owner !== requester.userId) {
      throw new AppException(errorDictionary.tasks.taskNotFound)
    }

    const [payment, mapping] = await Promise.all([
      this.paymentsRepository.fetchLatestByTaskId(taskId),
      this.tasksRepository.fetchTaskMappingByTaskId(taskId),
    ])

    const executor = mapping?.executorId
      ? await this.tasksRepository.fetchTaskCounterpartById(mapping.executorId)
      : null

    return {
      ...task,
      payment,
      executorId: mapping?.executorId ?? null,
      executor,
    }
  }
}
