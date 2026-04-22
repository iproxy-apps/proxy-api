import Stripe from 'stripe'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandlePaymentFailedService {
  constructor(private prisma: PrismaService) {}

  async execute(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payments.findFirst({
      where: { paymentIntent: paymentIntent.id },
      select: { taskId: true },
    })

    if (!payment) return

    await this.prisma.$transaction([
      this.prisma.payments.updateMany({
        where: { paymentIntent: paymentIntent.id },
        data: { status: 'failed' },
      }),
      this.prisma.userTaskMapping.deleteMany({
        where: { taskId: payment.taskId },
      }),
      this.prisma.tasks.update({
        where: { id: payment.taskId },
        data: { status: 'available', startedAt: null },
      }),
    ])
  }
}
