import Stripe from 'stripe'
import { Prisma } from '@prisma/client'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
import { StripeService } from 'src/stripe/stripe.service'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

@Injectable()
export class HandlePaymentSucceededService {
  private readonly logger = new Logger(HandlePaymentSucceededService.name)

  constructor(
    private prisma: PrismaService,
    private paymentsRepository: PaymentsRepository,
    private stripeService: StripeService,
  ) {}

  async execute(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const chargeId =
      typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : (paymentIntent.latest_charge?.id ?? null)

    const existing = await this.paymentsRepository.findByPaymentIntent(
      paymentIntent.id,
    )

    // failed / refunded / disputed rows are terminal: leave them untouched
    if (existing && !['pending', 'succeeded'].includes(existing.status)) {
      this.logger.error(
        `succeeded intent ${paymentIntent.id} ignored: payment is ${existing.status}`,
      )
      return
    }

    const taskId = existing?.taskId ?? paymentIntent.metadata?.taskId

    if (!taskId) {
      this.logger.warn(`succeeded intent ${paymentIntent.id} matches no task`)
      return
    }

    // same idempotent write as POST /tasks/start: whichever runs first creates
    // the row, the other only back-fills the charge id
    const payment = await this.paymentsRepository.recordSucceededCharge({
      taskId,
      paymentIntent: paymentIntent.id,
      amount: new Prisma.Decimal(paymentIntent.amount).div(100),
      chargeId,
    })

    if (payment.taskId !== taskId) {
      this.logger.error(
        `payment ${payment.id} belongs to task ${payment.taskId}, not ${taskId} (intent ${paymentIntent.id})`,
      )
      return
    }

    const task = await this.prisma.tasks.findUnique({
      where: { id: taskId },
      select: { status: true },
    })

    if (task?.status === 'canceled' && payment.status === 'succeeded') {
      // same key as cancel: Stripe never creates a second refund
      const refund = await this.stripeService.refundPaymentIntent(
        paymentIntent.id,
        `task:${taskId}:refund`,
      )
      if (
        !refund ||
        (refund.status !== 'succeeded' && refund.status !== 'pending')
      ) {
        this.logger.error(
          `late charge refund for task ${taskId} returned status ${refund?.status}`,
        )
        throw new Error(`refund of ${paymentIntent.id} did not succeed`)
      }
      await this.paymentsRepository.updateById(payment.id, {
        status: 'refunded',
        refundId: refund.id,
      })
      this.logger.warn(`late charge on canceled task ${taskId} refunded`)
    }
  }
}
