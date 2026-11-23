import z from 'zod'
import { Throttle } from '@nestjs/throttler'
import { Post, Body, HttpCode, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { RefreshAccessTokenService } from '../use-cases/refresh-access-token.service'

const refreshAccessTokenBodySchema = z
  .object({ refreshToken: z.string().min(20).max(200) })
  .strict()

type RefreshAccessTokenBodySchema = z.infer<typeof refreshAccessTokenBodySchema>

@Controller('/auth/refresh')
export class RefreshAccessTokenController {
  constructor(private refreshAccessTokenService: RefreshAccessTokenService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async handle(
    @Body(new ZodValidationPipe(refreshAccessTokenBodySchema))
    body: RefreshAccessTokenBodySchema,
  ) {
    return await this.refreshAccessTokenService.execute(body.refreshToken)
  }
}
