import { z } from 'zod'
import { Get, Query, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { FetchTransactionHistoryService } from '../use-cases/fetch-transaction-history.service'

import type { SessionPayload } from '../utils/jwt.strategy'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})

type QuerySchema = z.infer<typeof querySchema>

@Controller('/auth/transaction-history')
@UseGuards(JwtAuthGuard)
export class FetchTransactionHistoryController {
  constructor(
    private fetchTransactionHistoryService: FetchTransactionHistoryService,
  ) {}

  @Get()
  async handle(
    @User() user: SessionPayload,
    @Query(new ZodValidationPipe(querySchema)) query: QuerySchema,
  ) {
    const userId = user.sub
    return await this.fetchTransactionHistoryService.execute(userId, query.page)
  }
}
