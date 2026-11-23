import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

@Injectable()
export class HandlePaymentFailedService {
  private readonly logger = new Logger(HandlePaymentFailedService.name)

  constructor(
    private prisma: PrismaService,
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
  ) {}

  async execute(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // legacy rows created before the charge-then-write flow
    const legacy = await this.prisma.payments.findFirst({
      where: { paymentIntent: paymentIntent.id, status: 'pending' },
      select: { id: true, taskId: true },
    })

    if (legacy) {
      await this.prisma.$transaction(async (tx) => {
        const failed = await tx.payments.updateMany({
          where: { id: legacy.id, status: 'pending' },
          data: { status: 'failed' },
        })
        if (failed.count !== 1) {
          this.logger.warn(
            `payment ${legacy.id} no longer pending; left untouched`,
          )
          return
        }
        const reverted = await tx.tasks.updateMany({
          where: { id: legacy.taskId, status: 'in_progress' },
          data: { status: 'available', startedAt: null },
        })
        if (reverted.count === 1) {
          await tx.userTaskMapping.deleteMany({
            where: { taskId: legacy.taskId },
          })
        } else {
          this.logger.warn(
            `task ${legacy.taskId} not in_progress; left untouched`,
          )
        }
      })
      return
    }

    // a row exists and is not pending: never downgrade it
    if (await this.paymentsRepository.findByPaymentIntent(paymentIntent.id)) {
      return
    }

    const { taskId, proxyId, claimedAt } = paymentIntent.metadata ?? {}
    if (!taskId || !proxyId || !claimedAt) return

    const startedAt = new Date(claimedAt)
    if (Number.isNaN(startedAt.getTime())) {
      this.logger.warn(
        `payment_failed ${paymentIntent.id} has invalid claimedAt metadata`,
      )
      return
    }

    const task = await this.prisma.tasks.findUnique({
      where: { id: taskId },
      select: { owner: true },
    })

    // releases only that exact claim; no-op when already released or superseded
    await this.tasksRepository.releaseClaim({
      taskId,
      executorId: proxyId,
      startedAt,
      cardActionOwnerId: task?.owner,
    })
  }
}
