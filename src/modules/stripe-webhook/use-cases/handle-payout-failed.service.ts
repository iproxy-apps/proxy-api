import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'

@Injectable()
export class HandlePayoutFailedService {
  private readonly logger = new Logger(HandlePayoutFailedService.name)

  constructor(
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private tasksRepository: TasksRepository,
  ) {}

  async execute(payout: Stripe.Payout, accountId?: string): Promise<void> {
    if (!accountId) {
      this.logger.error(
        `Payout ${payout.id} failed without an account context: ` +
          `${payout.failure_code ?? 'no code'} — ${payout.failure_message ?? 'no message'}`,
      )
      return
    }

    const transactions = await this.stripeService.listPayoutTransactions(
      payout.id,
      accountId,
    )

    for (const transaction of transactions.data) {
      const source = transaction.source as Stripe.BalanceTransaction['source']
      if (!source || typeof source === 'string' || source.object !== 'transfer') {
        continue
      }

      const task = await this.tasksRepository.fetchTaskByTransferId(source.id)
      if (!task) continue

      const taskMapping = await this.tasksRepository.fetchTaskMappingByTaskId(
        task.id,
      )
      if (!taskMapping) continue

      const reversalAmount = Number(task.proxyEarnings ?? 0)

      try {
        await this.stripeService.reverseTransfer(source.id)
      } catch (error) {
        this.logger.error(
          `Failed to reverse transfer ${source.id} for task ${task.id}: ${String(error)}`,
        )
        continue
      }

      const proxy = await this.authRepository.fetchUserDetailsById(
        taskMapping.executorId,
      )
      if (proxy) {
        const currentBalance = proxy.walletBalance?.toNumber() ?? 0
        await this.authRepository.updateWalletBalance(
          proxy.id,
          currentBalance - reversalAmount,
        )
        await this.authRepository.updateTotalTasksCompleted(proxy.id, -1)
      }

      await this.tasksRepository.markPayoutFailed(task.id)

      this.logger.warn(
        `Reversed transfer ${source.id} for task ${task.id} after payout ${payout.id} failed`,
      )
    }

    this.logger.error(
      `Payout ${payout.id} failed for account ${accountId}: ` +
        `${payout.failure_code ?? 'no code'} — ${payout.failure_message ?? 'no message'}`,
    )
  }
}
