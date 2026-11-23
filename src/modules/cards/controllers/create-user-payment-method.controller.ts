import { z } from 'zod'
import { HttpCode, UseGuards, Controller, Post, Body } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { SaveCardService } from '../use-cases/save-card.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const createUserPaymentMethodBodySchema = z.object({
  paymentMethodId: z.string().min(1),
})

type CreateUserPaymentMethodBodySchema = z.infer<
  typeof createUserPaymentMethodBodySchema
>

@Controller('/card/create')
@UseGuards(JwtAuthGuard)
export class CreateUserPaymentMethodController {
  constructor(private saveCardService: SaveCardService) {}

  @Post()
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(createUserPaymentMethodBodySchema))
    body: CreateUserPaymentMethodBodySchema,
    @User() user: SessionPayload,
  ) {
    const userId = user.sub
    const { paymentMethodId } = body

    return await this.saveCardService.execute({
      userId,
      paymentMethodId,
    })
  }
}
