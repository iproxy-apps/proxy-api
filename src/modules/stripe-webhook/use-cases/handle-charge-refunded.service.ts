import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandleChargeRefundedService {
  private readonly logger = new Logger(HandleChargeRefundedService.name)

  constructor(private prisma: PrismaService) {}

  async execute(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id

    if (!paymentIntentId) return

    const refundId = charge.refunds?.data[0]?.id
    const full = charge.amount_refunded === charge.amount

    if (full) {
      const result = await this.prisma.payments.updateMany({
        where: {
          paymentIntent: paymentIntentId,
          status: { in: ['succeeded', 'pending'] },
        },
        data: { status: 'refunded', ...(refundId && { refundId }) },
      })
      if (result.count === 0) {
        this.logger.warn(
          `full refund on ${paymentIntentId} ignored: payment is not succeeded/pending (disputed, failed or already refunded)`,
        )
      }
      return
    }

    this.logger.warn(
      `partial refund on ${paymentIntentId} (${charge.amount_refunded}/${charge.amount}); status unchanged`,
    )
    if (refundId) {
      await this.prisma.payments.updateMany({
        where: { paymentIntent: paymentIntentId },
        data: { refundId },
      })
    }
  }
}
