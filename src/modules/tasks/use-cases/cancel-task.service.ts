import { Injectable, Logger } from '@nestjs/common'
import { differenceInHours } from 'date-fns'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { CancelTaskData } from '../types'

@Injectable()
export class CancelTaskService {
  private readonly logger = new Logger(CancelTaskService.name)

  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
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

    // a disputed payment blocks the cancel before anything is written
    const earlyPayment =
      await this.paymentsRepository.fetchLatestByTaskId(taskId)
    if (earlyPayment?.status === 'disputed') {
      throw new AppException(errorDictionary.payment.disputed)
    }

    // CAS before the Stripe call: only one concurrent cancel gets past here
    const originalStatus = task.status
    const claimed = await this.tasksRepository.transition({
      taskId,
      from: [originalStatus],
      to: 'canceled',
      data: { canceledAt: new Date() },
    })
    if (!claimed) {
      throw new AppException(errorDictionary.tasks.statusConflict)
    }

    // re-read after the CAS: a succeeded webhook landing between the first read
    // and the CAS would otherwise be refunded by neither side
    const payment = await this.paymentsRepository.fetchLatestByTaskId(taskId)
    if (payment?.status === 'disputed') {
      try {
        await this.tasksRepository.transition({
          taskId,
          from: ['canceled'],
          to: originalStatus,
          data: { canceledAt: null },
        })
      } catch (revertError) {
        this.logger.error(
          `revert of task ${taskId} to ${originalStatus} failed: ${String(revertError)}`,
        )
      }
      throw new AppException(errorDictionary.payment.disputed)
    }

    let refunded: { paymentId: string; refundId: string } | null = null
    try {
      switch (payment?.status) {
        case 'pending':
          // only rows created before this phase; the start no longer writes one
          this.logger.warn(
            `legacy pending payment ${payment.id} on canceled task ${taskId}`,
          )
          break
        case 'succeeded': {
          // full refund (no amount); the key is shared with the webhook refund
          const refund = await this.stripeService.refundPaymentIntent(
            payment.paymentIntent,
            `task:${taskId}:refund`,
          )
          if (
            !refund ||
            (refund.status !== 'succeeded' && refund.status !== 'pending')
          ) {
            throw new AppException(errorDictionary.payment.refundFailed)
          }
          refunded = { paymentId: payment.id, refundId: refund.id }
          break
        }
        default:
          // no payment, failed or already refunded: nothing to return
          break
      }
    } catch (error) {
      this.logger.error(`refund for task ${taskId} failed: ${String(error)}`)
      try {
        const reverted = await this.tasksRepository.transition({
          taskId,
          from: ['canceled'],
          to: originalStatus,
          data: { canceledAt: null },
        })
        if (!reverted) {
          this.logger.error(`revert of task ${taskId} matched no row`)
        }
      } catch (revertError) {
        this.logger.error(
          `revert of task ${taskId} to ${originalStatus} failed: ${String(revertError)}`,
        )
      }
      throw new AppException(errorDictionary.payment.refundFailed)
    }

    if (refunded) {
      // Stripe accepted the refund: the task stays canceled whatever happens
      // here (the charge.refunded webhook repairs the payment row)
      try {
        await this.paymentsRepository.updateById(refunded.paymentId, {
          status: 'refunded',
          refundId: refunded.refundId,
        })
      } catch (error) {
        this.logger.error(
          `task ${taskId} refunded by ${refunded.refundId} but payment ${refunded.paymentId} not marked refunded: ${String(error)}`,
        )
        throw error
      }
    }
  }
}
