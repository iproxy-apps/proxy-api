import { Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { StripeService } from 'src/stripe/stripe.service'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { computeCharge, toCentavos } from 'src/common/money'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { RateProxyService } from 'src/modules/ratings/use-cases/rate-proxy.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'

import type { ValidateTaskData } from '../types'

@Injectable()
export class ValidateTaskService {
  private readonly logger = new Logger(ValidateTaskService.name)

  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
    private rateProxyService: RateProxyService,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(data: ValidateTaskData): Promise<void> {
    const { taskId, userId, rating, comment } = data

    const taskDetails = await this.tasksRepository.fetchTaskById({ taskId })

    // validations
    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)

    if (taskDetails.owner !== userId) {
      throw new AppException(errorDictionary.tasks.cannotValidateTask)
    }

    if (taskDetails.status !== 'verification_required') {
      throw new AppException(errorDictionary.tasks.statusConflict)
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

    // the proxy is only paid out of a confirmed charge
    const payment = await this.paymentsRepository.fetchLatestByTaskId(taskId)
    if (payment?.status === 'disputed') {
      throw new AppException(errorDictionary.payment.disputed)
    }
    if (!payment || payment.status !== 'succeeded' || !payment.chargeId) {
      throw new AppException(errorDictionary.payment.notConfirmed)
    }

    const earnings =
      taskDetails.proxyEarnings ??
      computeCharge(taskDetails.offeredPrice).proxyEarnings

    // CAS before the Stripe call: only one concurrent validate gets past here
    const claimed = await this.tasksRepository.transition({
      taskId,
      from: ['verification_required'],
      to: 'completed',
    })
    if (!claimed) {
      throw new AppException(errorDictionary.tasks.statusConflict)
    }

    let transferId: string
    try {
      const transfer = await this.stripeService.createTransferFromCharge(
        {
          amount: toCentavos(earnings),
          destination: proxy.stripeAccountId,
          sourceTransaction: payment.chargeId,
          transferGroup: taskId,
          taskId,
        },
        `task:${taskId}:transfer`,
      )
      if (!transfer?.id) {
        throw new AppException(errorDictionary.tasks.transferFailed)
      }
      transferId = transfer.id
    } catch (error) {
      this.logger.error(`transfer for task ${taskId} failed: ${String(error)}`)
      try {
        await this.tasksRepository.transition({
          taskId,
          from: ['completed'],
          to: 'verification_required',
        })
      } catch (revertError) {
        this.logger.error(
          `revert of task ${taskId} to verification_required failed: ${String(revertError)}`,
        )
      }
      throw new AppException(errorDictionary.tasks.transferFailed)
    }

    try {
      await this.tasksRepository.recordTransfer({
        taskId,
        executorId: taskMapping.executorId,
        transferId,
        proxyEarnings: earnings,
      })
    } catch (error) {
      // the proxy is already paid: do not revert, a re-validate is only safe
      // inside the 24 h idempotency window
      this.logger.error(
        `task ${taskId} paid by transfer ${transferId} but recordTransfer failed: ${String(error)}`,
      )
      throw error
    }

    if (rating !== undefined) {
      try {
        await this.rateProxyService.execute({
          taskId,
          raterId: userId,
          ratedId: taskMapping.executorId,
          score: rating,
          comment,
        })
      } catch (error) {
        this.logger.warn(
          `rating for task ${taskId} failed after payout: ${String(error)}`,
        )
      }
    }
  }
}
