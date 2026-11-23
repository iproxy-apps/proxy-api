import { Injectable, Logger } from '@nestjs/common'

import { toCentavos } from 'src/common/money'
import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { NotificationService } from 'src/notification/notification.service'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'

import type Stripe from 'stripe'
import type { UserCard } from 'src/modules/cards/types'
import type { StartTaskData, StartTaskResult } from '../types'

type ChargeOutcome = 'succeeded' | 'declined' | 'unknown'

@Injectable()
export class StartTaskService {
  private readonly logger = new Logger(StartTaskService.name)

  constructor(
    private stripeService: StripeService,
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
    private fetchUserCardService: FetchUserCardService,
    private fetchUserDetailsService: FetchUserDetailsService,
    private notificationService: NotificationService,
  ) {}

  async execute(data: StartTaskData): Promise<StartTaskResult> {
    const { taskId, userId } = data

    // 1. task + status gate
    const task = await this.tasksRepository.fetchTaskById({ taskId })
    if (!task) throw new AppException(errorDictionary.tasks.taskNotFound)

    if (task.status !== 'available' && task.status !== 'in_progress') {
      throw new AppException(errorDictionary.tasks.taskNotAvailable)
    }

    if (task.status === 'in_progress') {
      const mapping =
        await this.tasksRepository.fetchTaskMappingByTaskId(taskId)
      if (mapping?.executorId !== userId) {
        throw new AppException(errorDictionary.tasks.taskNotAvailable)
      }
    }

    // 2. owner cannot start their own task
    if (task.owner === userId) {
      throw new AppException(errorDictionary.tasks.cannotStartOwnTask)
    }

    // 3. proxy with completed merchant onboarding
    const userDetails = await this.fetchUserDetailsService.execute(userId)
    if (userDetails.userType !== 'PROXY' || !userDetails.stripeAccountReady) {
      throw new AppException(errorDictionary.user.userNotProxy)
    }

    // this proxy already holds the live claim: a replay must not need the card
    const ownClaim = task.status === 'in_progress'
    if (ownClaim) {
      const replay = await this.replayOwnClaim(taskId)
      if (replay) return replay
    }

    const notifyClient = async (): Promise<void> => {
      try {
        await this.notificationService.sendCardChargeFailedEmail(
          task.ownerId.email,
          task.ownerId.name,
          task.title,
        )
      } catch (error) {
        this.logger.warn(
          `start ${taskId}: card charge failed e-mail not sent (${String(error)})`,
        )
      }
    }

    // 4. owner card + customer: without them there is nothing to charge
    let card: UserCard | null = null
    try {
      card = await this.fetchUserCardService.execute(task.owner)
    } catch (error) {
      if (
        !(error instanceof AppException) ||
        error.errorCode !== errorDictionary.card.noSavedCardFound.errorCode
      ) {
        throw error
      }
    }
    const customer = task.ownerId.stripeCustomerId

    if (!card || !card.stripeCardId || !customer) {
      if (ownClaim) {
        this.logger.error(
          `start ${taskId}: claim held but owner card/customer missing`,
        )
        throw new AppException(errorDictionary.payment.chargePending)
      }
      await this.tasksRepository.flagCardActionRequired(task.owner)
      await notifyClient()
      throw new AppException(errorDictionary.payment.paymentFailed)
    }

    // 5. claim (CAS) before any Stripe call: the race is decided here
    let startedAt = new Date()
    const claimed =
      task.status === 'available' &&
      (await this.tasksRepository.claimTask({
        taskId,
        executorId: userId,
        startedAt,
      }))

    if (!claimed) {
      const current = await this.tasksRepository.fetchClaim(taskId)
      if (
        current?.status !== 'in_progress' ||
        current.executorId !== userId ||
        !current.startedAt
      ) {
        throw new AppException(errorDictionary.tasks.taskNotAvailable)
      }

      const replay = await this.replayOwnClaim(taskId)
      if (replay) return replay

      // resume the same claim: same key, same PaymentIntent
      startedAt = current.startedAt
    }

    // 6. charge with automatic capture
    const charged = task.chargedAmount ?? task.offeredPrice
    const key = `start:${taskId}:${userId}:${startedAt.getTime()}`
    let paymentIntent: Stripe.PaymentIntent | null = null
    let outcome: ChargeOutcome
    let errorType: string | undefined

    try {
      paymentIntent = await this.stripeService.chargeSavedCard(
        {
          amount: toCentavos(charged),
          customer,
          paymentMethod: card.stripeCardId,
          taskId,
          proxyId: userId,
          claimedAt: startedAt.toISOString(),
        },
        key,
      )
      outcome =
        paymentIntent.status === 'succeeded'
          ? 'succeeded'
          : paymentIntent.status === 'processing'
            ? 'unknown'
            : 'declined'
    } catch (error) {
      errorType = (error as { type?: string } | null)?.type
      outcome =
        errorType === 'StripeCardError' ||
        errorType === 'StripeInvalidRequestError'
          ? 'declined'
          : 'unknown'
    }

    // 7. act on the outcome
    if (outcome === 'succeeded' && paymentIntent) {
      const latestCharge = paymentIntent.latest_charge
      const row = await this.paymentsRepository.recordSucceededCharge({
        taskId,
        paymentIntent: paymentIntent.id,
        amount: charged,
        chargeId:
          typeof latestCharge === 'string'
            ? latestCharge
            : (latestCharge?.id ?? null),
      })
      if (row.taskId !== taskId) {
        this.logger.error(
          `start ${taskId}: payment ${paymentIntent.id} belongs to task ${row.taskId}`,
        )
      }
      if (
        row.taskId === taskId &&
        (await this.refundIfCanceled(taskId, row.id, paymentIntent.id))
      ) {
        throw new AppException(errorDictionary.tasks.taskNotAvailable)
      }
      return { status: 'succeeded' }
    }

    if (outcome === 'declined') {
      await this.tasksRepository.releaseClaim({
        taskId,
        executorId: userId,
        startedAt,
        cardActionOwnerId: task.owner,
      })
      await notifyClient()
      throw new AppException(errorDictionary.payment.paymentFailed)
    }

    this.logger.error(
      `start ${taskId}: charge outcome unknown (${errorType ?? paymentIntent?.status}), key ${key}`,
    )
    throw new AppException(errorDictionary.payment.chargePending)
  }

  // own claim: a succeeded payment is a replay; any other row blocks a second charge
  private async replayOwnClaim(
    taskId: string,
  ): Promise<StartTaskResult | null> {
    const latest = await this.paymentsRepository.fetchLatestByTaskId(taskId)
    if (!latest) return null
    if (latest.status === 'succeeded') return { status: 'succeeded' }
    this.logger.error(
      `start ${taskId}: claim held with a ${latest.status} payment row; no second charge`,
    )
    throw new AppException(errorDictionary.payment.chargePending)
  }

  // the task may have been canceled while the charge was in flight; the
  // webhook path refunds with the same key, so a double attempt is harmless
  private async refundIfCanceled(
    taskId: string,
    paymentId: string,
    paymentIntentId: string,
  ): Promise<boolean> {
    const current = await this.tasksRepository.fetchClaim(taskId)
    if (current?.status !== 'canceled') return false
    try {
      const refund = await this.stripeService.refundPaymentIntent(
        paymentIntentId,
        `task:${taskId}:refund`,
      )
      if (refund?.status === 'succeeded' || refund?.status === 'pending') {
        await this.paymentsRepository.updateById(paymentId, {
          status: 'refunded',
          refundId: refund.id,
        })
        this.logger.warn(`start ${taskId}: charge on canceled task refunded`)
      } else {
        // row stays succeeded: the payment_intent.succeeded webhook retries with the same key
        this.logger.error(
          `start ${taskId}: refund of ${paymentIntentId} returned status ${refund?.status}`,
        )
      }
    } catch (error) {
      this.logger.error(
        `start ${taskId}: refund of ${paymentIntentId} on canceled task failed: ${String(error)}`,
      )
    }
    return true
  }
}
