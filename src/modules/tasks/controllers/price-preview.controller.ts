import { z } from 'zod'
import { Get, HttpCode, UseGuards, Controller, Query } from '@nestjs/common'

import { MAX_OFFERED_PRICE, MIN_OFFERED_PRICE } from 'src/common/money'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { PricePreviewService } from '../use-cases/price-preview.service'

const querySchema = z.object({
  offeredPrice: z.coerce
    .number()
    .min(MIN_OFFERED_PRICE)
    .max(MAX_OFFERED_PRICE)
    .multipleOf(0.01),
})

type QuerySchema = z.infer<typeof querySchema>

@Controller('/tasks/price-preview')
@UseGuards(JwtAuthGuard)
export class PricePreviewController {
  constructor(private pricePreviewService: PricePreviewService) {}

  @Get()
  @HttpCode(200)
  handle(
    @Query(new ZodValidationPipe(querySchema))
    query: QuerySchema,
  ) {
    return this.pricePreviewService.execute(query.offeredPrice)
  }
}
