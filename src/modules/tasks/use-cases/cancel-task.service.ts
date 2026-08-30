import { Injectable } from '@nestjs/common'
import { differenceInHours } from 'date-fns'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchPaymentRecordService } from 'src/modules/payments/use-cases/fetch-payment-record.service'
import { UpdatePaymentRecordService } from 'src/modules/payments/use-cases/update-payment-record.service'

import type { CancelTaskData } from '../types'

@Injectable()
export class CancelTaskService {
  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private fetchPaymentRecordService: FetchPaymentRecordService,
    private updatePaymentRecordService: UpdatePaymentRecordService,
  ) {}

  async execute(data: CancelTaskData): Promise<void> {
    const { taskId, userId } = data

    const task = await this.tasksRepository.fetchTaskById({ taskId })
    if (!task) throw new AppException(errorDictionary.tasks.taskNotFound)

    if (task.owner !== userId) {
      throw new AppException(errorDictionary.tasks.cannotCancelTask)
    }

    // Only `available` (posted, no Proxy yet) or `in_progress` (Proxy started
    // but still within grace period) can be canceled by the client.
    if (task.status !== 'available' && task.status !== 'in_progress') {
      throw new AppException(errorDictionary.tasks.cannotCancelTask)
    }

    // For `in_progress`, enforce the 1h grace period after startedAt.
    if (task.status === 'in_progress') {
      if (!task.startedAt) {
        throw new AppException(errorDictionary.tasks.cannotCancelTask)
      }
      const elapsedHours = differenceInHours(new Date(), task.startedAt as Date)
      if (elapsedHours >= 1) {
        throw new AppException(errorDictionary.tasks.cannotCancelTask)
      }
    }

    // Refund the pre-authorized payment if one exists. `available` tasks
    // won't have a payment record yet — the Proxy creates it on `/tasks/start`.
    const paymentRecord = await this.fetchPaymentRecordService.execute(taskId)
    let refundId: string | undefined

    if (paymentRecord) {
      try {
        const refund = await this.stripeService.refundPayment(
          paymentRecord.paymentIntent,
        )
        if (!refund || refund.status !== 'succeeded') {
          throw new AppException(errorDictionary.payment.refundFailed)
        }
        refundId = refund.id
      } catch (error) {
        if (error instanceof AppException) throw error
        throw new AppException(errorDictionary.payment.refundFailed)
      }
    }

    await this.tasksRepository.updateTaskStatus({
      taskId,
      status: 'canceled',
      canceledAt: new Date(),
    })

    if (paymentRecord && refundId) {
      await this.updatePaymentRecordService.execute(taskId, {
        ...paymentRecord,
        refundId,
      })
    }
  }
}
