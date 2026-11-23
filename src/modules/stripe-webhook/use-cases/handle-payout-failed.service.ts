import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandlePayoutFailedService {
  private readonly logger = new Logger(HandlePayoutFailedService.name)

  constructor(private prisma: PrismaService) {}

  async execute(payout: Stripe.Payout, accountId?: string): Promise<void> {
    const reason =
      `${payout.failure_code ?? 'no code'} — ` +
      `${payout.failure_message ?? 'no message'}`

    if (!accountId) {
      this.logger.error(
        `Payout ${payout.id} failed without an account context: ${reason}`,
      )
      return
    }

    const result = await this.prisma.users.updateMany({
      where: { stripeAccountId: accountId },
      data: { payoutIssue: true },
    })

    if (result.count === 0) {
      this.logger.warn(
        `Payout ${payout.id} failed but no user has stripeAccountId ${accountId}`,
      )
    }

    this.logger.error(
      `Payout ${payout.id} failed for account ${accountId}: ${reason}`,
    )
  }
}
