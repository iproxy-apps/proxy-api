import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class HandlePayoutFailedService {
  private readonly logger = new Logger(HandlePayoutFailedService.name)

  constructor(private prisma: PrismaService) {}

  async execute(payout: Stripe.Payout, accountId?: string): Promise<void> {
    const user = accountId
      ? await this.prisma.users.findFirst({
          where: { stripeAccountId: accountId },
          select: { id: true, email: true },
        })
      : null

    this.logger.error(
      `Payout ${payout.id} failed for account ${accountId ?? 'unknown'} ` +
        `(user: ${user?.id ?? 'unknown'}, email: ${user?.email ?? 'unknown'}): ` +
        `${payout.failure_code ?? 'no code'} — ${payout.failure_message ?? 'no message'}`,
    )
  }
}
