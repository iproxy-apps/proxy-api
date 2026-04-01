import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'
import { CreatePaymentRecordService } from 'src/modules/payments/use-cases/create-payment-record.service'

import type { StartTaskData } from '../types'

@Injectable()
export class StartTaskService {
  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private fetchUserCardService: FetchUserCardService,
    private fetchUserDetailsService: FetchUserDetailsService,
    private createPaymentRecordService: CreatePaymentRecordService,
  ) {}

  async execute(data: StartTaskData): Promise<void> {
    const { taskId, userId } = data

    const taskDetails = await this.tasksRepository.fetchTaskById({
      taskId,
      status: 'available',
    })

    // validations
    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)

    if (taskDetails.status !== 'available') {
      throw new AppException(errorDictionary.tasks.taskNotAvailable)
    }

    if (taskDetails.owner === userId) {
      throw new AppException(errorDictionary.tasks.cannotStartOwnTask)
    }

    // check if user is proxy
    const userDetails = await this.fetchUserDetailsService.execute(userId)
    if (userDetails.userType !== 'PROXY') {
      throw new AppException(errorDictionary.user.userNotProxy)
    }

    await this.tasksRepository.updateTaskStatus({
      taskId,
      status: 'in_progress',
      startedAt: new Date(),
    })

    await this.tasksRepository.insertTaskUserMapping(taskId, userId)

    const ownerCard = await this.fetchUserCardService.execute(taskDetails.owner)
    const savedCard = String(ownerCard.stripeCardId)

    // need to charge the task owner
    try {
      const paymentIntentCreation =
        await this.stripeService.createPaymentIntent({
          savedCard,
          amount: taskDetails.offeredPrice * 100,
          customer: String(taskDetails.ownerId.stripeCustomerId),
        })

      if (!paymentIntentCreation || paymentIntentCreation.id) {
        throw new AppException(errorDictionary.payment.paymentFailed)
      }

      const paymentIntentConfirmation =
        await this.stripeService.confirmPaymentIntent(
          paymentIntentCreation.id,
          savedCard,
        )

      if (
        !paymentIntentConfirmation ||
        paymentIntentConfirmation.status !== 'succeeded'
      ) {
        throw new AppException(errorDictionary.payment.paymentFailed)
      }

      await this.createPaymentRecordService.execute({
        taskId,
        amount: taskDetails.offeredPrice,
        paymentIntent: paymentIntentConfirmation.id,
      })
    } catch (error) {
      if (error instanceof AppException) throw error
      throw new AppException(errorDictionary.payment.paymentFailed)
    }
  }
}
