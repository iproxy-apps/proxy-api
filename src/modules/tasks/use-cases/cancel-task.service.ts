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

    const taskDetails = await this.tasksRepository.fetchTaskById({
      taskId,
      status: 'in_progress',
    })

    // validations
    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)
    if (taskDetails.status !== 'in_progress') {
      throw new AppException(errorDictionary.tasks.taskNotAvailable)
    }
    if (taskDetails.owner !== userId) {
      throw new AppException(errorDictionary.tasks.cannotCancelTask)
    }

    // validate if task started at date is greater than 1 hour
    const isGreaterThanOneHour = differenceInHours(new Date(), taskDetails.startedAt as Date) >= 1 // prettier-ignore
    if (isGreaterThanOneHour) {
      const paymentRecord = await this.fetchPaymentRecordService.execute(taskId) // prettier-ignore
      if (paymentRecord) {
        let refund: Awaited<ReturnType<StripeService['refundPayment']>>

        try {
          refund = await this.stripeService.refundPayment(paymentRecord.paymentIntent) // prettier-ignore

          if (!refund || refund.status !== 'succeeded') {
            throw new AppException(errorDictionary.payment.refundFailed)
          }
        } catch (error) {
          if (error instanceof AppException) throw error
          throw new AppException(errorDictionary.payment.refundFailed)
        }

        await this.tasksRepository.updateTaskStatus({
          taskId,
          status: 'canceled',
          canceledAt: new Date(),
        })

        await this.updatePaymentRecordService.execute(taskId, {
          ...paymentRecord,
          refundId: refund.id,
        })
      }
    }
  }
}
