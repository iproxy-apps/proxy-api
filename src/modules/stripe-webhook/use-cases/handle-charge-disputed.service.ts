import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandleChargeDisputedService {
  private readonly logger = new Logger(HandleChargeDisputedService.name)

  constructor(private prisma: PrismaService) {}

  async execute(dispute: Stripe.Dispute): Promise<void> {
    const paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id

    if (!paymentIntentId) return

    const payment = await this.prisma.payments.findFirst({
      where: { paymentIntent: paymentIntentId },
      select: {
        id: true,
        taskId: true,
        task: { select: { status: true } },
      },
    })

    if (!payment) return

    const result = await this.prisma.payments.updateMany({
      where: { id: payment.id, status: { not: 'disputed' } },
      data: { status: 'disputed', disputeId: dispute.id },
    })

    if (result.count === 0) {
      this.logger.warn(
        `dispute ${dispute.id} ignored: payment ${payment.id} is already disputed`,
      )
      return
    }

    this.logger.warn(
      `dispute ${dispute.id} on task ${payment.taskId} (${payment.task.status}) — manual review`,
    )
  }
}
