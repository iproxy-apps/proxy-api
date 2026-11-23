import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'
import { CreatePaymentRecordService } from 'src/modules/payments/use-cases/create-payment-record.service'

import type { StartTaskData, StartTaskResult } from '../types'

@Injectable()
export class StartTaskService {
  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private fetchUserCardService: FetchUserCardService,
    private fetchUserDetailsService: FetchUserDetailsService,
    private createPaymentRecordService: CreatePaymentRecordService,
  ) {}

  async execute(data: StartTaskData): Promise<StartTaskResult> {
    const { taskId, userId } = data

    const taskDetails = await this.tasksRepository.fetchTaskById({
      taskId,
      status: 'available',
    })

    // validations
    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)

    if (taskDetails.owner === userId) {
      throw new AppException(errorDictionary.tasks.cannotStartOwnTask)
    }

    // check if user is proxy with completed merchant onboarding
    const userDetails = await this.fetchUserDetailsService.execute(userId)
    if (userDetails.userType !== 'PROXY' || !userDetails.stripeAccountReady) {
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

    // charge the task owner; payment record is created as pending before
    // confirmation so webhooks can later flip it to succeeded/failed
    try {
      const offeredPrice = Number(taskDetails.offeredPrice)
      const paymentIntent = await this.stripeService.createPaymentIntent({
        savedCard,
        amount: offeredPrice * 100,
        customer: String(taskDetails.ownerId.stripeCustomerId),
      })

      if (!paymentIntent?.id) {
        throw new AppException(errorDictionary.payment.paymentFailed)
      }

      await this.createPaymentRecordService.execute({
        taskId,
        amount: offeredPrice,
        paymentIntent: paymentIntent.id,
      })

      const confirmation = await this.stripeService.confirmPaymentIntent(
        paymentIntent.id,
        savedCard,
      )

      if (!confirmation) {
        throw new AppException(errorDictionary.payment.paymentFailed)
      }

      if (confirmation.status === 'succeeded') {
        return { status: 'succeeded' }
      }

      if (confirmation.status === 'requires_action') {
        return {
          status: 'requires_action',
          clientSecret: confirmation.client_secret ?? null,
        }
      }

      throw new AppException(errorDictionary.payment.paymentFailed)
    } catch (error) {
      if (error instanceof AppException) throw error
      throw new AppException(errorDictionary.payment.paymentFailed)
    }
  }
}
