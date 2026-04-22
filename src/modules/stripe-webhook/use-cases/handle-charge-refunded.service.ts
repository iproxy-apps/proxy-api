import Stripe from 'stripe'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandleChargeRefundedService {
  constructor(private prisma: PrismaService) {}

  async execute(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id

    if (!paymentIntentId) return

    const refundId = charge.refunds?.data[0]?.id ?? null

    await this.prisma.payments.updateMany({
      where: { paymentIntent: paymentIntentId },
      data: { status: 'refunded', refundId },
    })
  }
}
