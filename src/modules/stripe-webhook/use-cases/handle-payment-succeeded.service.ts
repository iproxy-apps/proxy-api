import Stripe from 'stripe'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandlePaymentSucceededService {
  constructor(private prisma: PrismaService) {}

  async execute(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    await this.prisma.payments.updateMany({
      where: { paymentIntent: paymentIntent.id, status: 'pending' },
      data: { status: 'succeeded' },
    })
  }
}
