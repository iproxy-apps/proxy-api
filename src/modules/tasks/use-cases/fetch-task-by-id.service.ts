import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import {
  toPaymentResponse,
  toPublicUser,
  toTaskResponse,
} from '../utils/task-response'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { UserType } from 'src/modules/auth/types'
import type { TaskDetailResponse } from '../types'

type Requester = {
  userId: string
  userType: UserType
}

const PHONE_VISIBLE_STATUSES = ['in_progress', 'verification_required']

@Injectable()
export class FetchTaskByIdService {
  constructor(
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
    private authRepository: AuthRepository,
  ) {}

  async execute(
    taskId: string,
    requester: Requester,
  ): Promise<TaskDetailResponse> {
    const task = await this.tasksRepository.fetchTaskById({ taskId })
    if (!task) throw new AppException(errorDictionary.tasks.taskNotFound)

    const mapping = await this.tasksRepository.fetchTaskMappingByTaskId(taskId)
    const isOwner = task.owner === requester.userId
    const isExecutor = mapping?.executorId === requester.userId

    // Only the owner, the executor, or a PROXY browsing an available task may
    // read it. Everyone else gets the same 404 as a missing task.
    if (
      !isOwner &&
      !isExecutor &&
      !(requester.userType === 'PROXY' && task.status === 'available')
    ) {
      throw new AppException(errorDictionary.tasks.taskNotFound)
    }

    const executorRow = mapping
      ? await this.tasksRepository.fetchTaskCounterpartById(mapping.executorId)
      : null
    const executor = executorRow ? toPublicUser(executorRow) : null
    const response = toTaskResponse(task)
    const ownerId: TaskDetailResponse['ownerId'] = { ...response.ownerId }

    const phonesVisible =
      (isOwner || isExecutor) && PHONE_VISIBLE_STATUSES.includes(task.status)
    const detailExecutor: TaskDetailResponse['executor'] = executor
      ? { ...executor }
      : null
    if (phonesVisible) {
      if (isOwner && detailExecutor && mapping) {
        detailExecutor.phoneNumber =
          await this.authRepository.fetchPhoneNumberById(mapping.executorId)
      }
      if (isExecutor) {
        ownerId.phoneNumber = await this.authRepository.fetchPhoneNumberById(
          task.owner,
        )
      }
    }

    const record = isOwner
      ? await this.paymentsRepository.fetchLatestByTaskId(taskId)
      : null

    return {
      ...response,
      ownerId,
      executorId: mapping?.executorId ?? null,
      executor: detailExecutor,
      payment: record ? toPaymentResponse(record) : null,
    }
  }
}
