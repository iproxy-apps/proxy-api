import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { UpdateWalletBalanceService } from 'src/modules/auth/use-cases/update-wallet-balance.service'
import { UpdateTotalTasksCompletedService } from 'src/modules/auth/use-cases/update-total-tasks-completed.service'

import type { ValidateTaskData } from '../types'

@Injectable()
export class ValidateTaskService {
  constructor(
    private tasksRepository: TasksRepository,
    private updateWalletBalanceService: UpdateWalletBalanceService,
    private updateTotalTasksCompletedService: UpdateTotalTasksCompletedService,
  ) {}

  async execute(data: ValidateTaskData): Promise<void> {
    const { taskId, userId } = data

    const taskDetails = await this.tasksRepository.fetchTaskById({
      taskId,
      status: 'verification_required',
    })

    // validations
    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)

    if (taskDetails.owner !== userId) {
      throw new AppException(errorDictionary.tasks.cannotValidateTask)
    }

    const taskMapping =
      await this.tasksRepository.fetchTaskMappingByTaskId(taskId)

    if (!taskMapping) {
      throw new AppException(errorDictionary.tasks.taskMappingNotFound)
    }

    // offeredPrice - stripe fee (3.99% + R$ 0.39) - platform fee (20%)
    const stripeFee = taskDetails.offeredPrice * 0.0399 + 0.39
    const proxyFee = taskDetails.offeredPrice * 0.2
    const amountToBePaid = taskDetails.offeredPrice - stripeFee - proxyFee

    await this.tasksRepository.validateTaskCompletion({
      taskId,
      status: 'completed',
      platformFee: stripeFee,
      proxyEarnings: proxyFee,
    })

    await this.updateTotalTasksCompletedService.execute({
      id: taskMapping.executorId,
      tasksCompleted: 1, // Increment by 1 for each validated task
    })

    await this.updateWalletBalanceService.execute({
      amount: amountToBePaid,
      userId: taskMapping.executorId,
    })
  }
}
