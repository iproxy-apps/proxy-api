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

    this.logger.warn(
      `Dispute ${dispute.id} opened for payment intent ${paymentIntentId}`,
    )

    const payment = await this.prisma.payments.findFirst({
      where: { paymentIntent: paymentIntentId },
      select: {
        id: true,
        taskId: true,
        task: { select: { status: true, proxyEarnings: true } },
      },
    })

    if (!payment) return

    const mapping = await this.prisma.userTaskMapping.findUnique({
      where: { taskId: payment.taskId },
      select: { executorId: true },
    })

    const shouldReverseWallet =
      payment.task.status === 'completed' &&
      payment.task.proxyEarnings !== null &&
      mapping !== null

    if (!shouldReverseWallet) {
      await this.prisma.payments.update({
        where: { id: payment.id },
        data: { status: 'disputed' },
      })
      return
    }

    await this.prisma.$transaction([
      this.prisma.payments.update({
        where: { id: payment.id },
        data: { status: 'disputed' },
      }),
      this.prisma.users.update({
        where: { id: mapping.executorId },
        data: {
          walletBalance: { decrement: payment.task.proxyEarnings! },
        },
      }),
    ])

    this.logger.warn(
      `Reversed ${payment.task.proxyEarnings?.toString()} from executor ${mapping.executorId} due to dispute ${dispute.id}`,
    )
  }
}
