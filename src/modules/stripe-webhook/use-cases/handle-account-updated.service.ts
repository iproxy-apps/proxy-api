import Stripe from 'stripe'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandleAccountUpdatedService {
  constructor(private prisma: PrismaService) {}

  async execute(account: Stripe.Account): Promise<void> {
    const ready = Boolean(account.charges_enabled && account.payouts_enabled)

    await this.prisma.users.updateMany({
      where: { stripeAccountId: account.id },
      data: { stripeAccountReady: ready },
    })
  }
}
