import { Get, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { FetchTransactionHistoryService } from '../use-cases/fetch-transaction-history.service'

import type { SessionPayload } from '../utils/jwt.strategy'

@Controller('/auth/transaction-history')
@UseGuards(JwtAuthGuard)
export class FetchTransactionHistoryController {
  constructor(
    private fetchTransactionHistoryService: FetchTransactionHistoryService,
  ) {}

  @Get()
  async handle(@User() user: SessionPayload) {
    const userId = user.sub
    return await this.fetchTransactionHistoryService.execute(userId)
  }
}
