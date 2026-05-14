import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { StripeService } from 'src/stripe/stripe.service'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { RateProxyService } from 'src/modules/ratings/use-cases/rate-proxy.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'
import { UpdateWalletBalanceService } from 'src/modules/auth/use-cases/update-wallet-balance.service'
import { UpdateTotalTasksCompletedService } from 'src/modules/auth/use-cases/update-total-tasks-completed.service'

import type { ValidateTaskData } from '../types'

@Injectable()
export class ValidateTaskService {
  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private rateProxyService: RateProxyService,
    private fetchUserDetailsService: FetchUserDetailsService,
    private updateWalletBalanceService: UpdateWalletBalanceService,
    private updateTotalTasksCompletedService: UpdateTotalTasksCompletedService,
  ) {}

  async execute(data: ValidateTaskData): Promise<void> {
    const { taskId, userId, rating, comment } = data

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

    const proxy = await this.fetchUserDetailsService.execute(
      taskMapping.executorId,
    )
    if (!proxy || !proxy.stripeAccountReady || !proxy.stripeAccountId) {
      throw new AppException(errorDictionary.tasks.proxyAccountNotReady)
    }

    // offeredPrice - stripe fee (3.99% + R$ 0.39) - platform fee (20%) = proxy net
    const stripeFee = taskDetails.offeredPrice * 0.0399 + 0.39
    const platformFee = taskDetails.offeredPrice * 0.2
    const proxyEarnings = taskDetails.offeredPrice - stripeFee - platformFee

    let transferId: string
    try {
      const transfer = await this.stripeService.createTransfer({
        amount: Math.round(proxyEarnings * 100),
        destination: proxy.stripeAccountId,
        metadata: { taskId },
      })
      if (!transfer?.id) {
        throw new AppException(errorDictionary.tasks.transferFailed)
      }
      transferId = transfer.id
    } catch (error) {
      if (error instanceof AppException) throw error
      throw new AppException(errorDictionary.tasks.transferFailed)
    }

    await this.tasksRepository.validateTaskCompletion({
      taskId,
      transferId,
      status: 'completed',
      platformFee,
      proxyEarnings,
    })

    await this.updateTotalTasksCompletedService.execute({
      id: taskMapping.executorId,
      tasksCompleted: 1,
    })

    await this.updateWalletBalanceService.execute({
      amount: proxyEarnings,
      userId: taskMapping.executorId,
    })

    if (rating !== undefined) {
      await this.rateProxyService.execute({
        taskId,
        raterId: userId,
        ratedId: taskMapping.executorId,
        score: rating,
        comment,
      })
    }
  }
}
