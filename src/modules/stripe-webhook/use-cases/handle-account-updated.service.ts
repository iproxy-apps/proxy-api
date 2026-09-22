import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandleAccountUpdatedService {
  private readonly logger = new Logger(HandleAccountUpdatedService.name)

  constructor(private prisma: PrismaService) {}

  async execute(account: Stripe.Account): Promise<void> {
    const ready = Boolean(account.charges_enabled && account.payouts_enabled)

    this.logger.log(
      `account.updated for ${account.id} — charges_enabled=${account.charges_enabled}, payouts_enabled=${account.payouts_enabled}, ready=${ready}`,
    )

    const result = await this.prisma.users.updateMany({
      where: { stripeAccountId: account.id },
      data: { stripeAccountReady: ready },
    })

    this.logger.log(
      `Updated ${result.count} user(s) with stripeAccountId=${account.id} → stripeAccountReady=${ready}`,
    )
  }
}
