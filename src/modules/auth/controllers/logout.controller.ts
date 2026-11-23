import z from 'zod'
import { Throttle } from '@nestjs/throttler'
import { Post, Body, HttpCode, Controller } from '@nestjs/common'

import { LogoutService } from '../use-cases/logout.service'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'

const logoutBodySchema = z
  .object({ refreshToken: z.string().min(20).max(200) })
  .strict()

type LogoutBodySchema = z.infer<typeof logoutBodySchema>

@Controller('/auth/logout')
export class LogoutController {
  constructor(private logoutService: LogoutService) {}

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async handle(
    @Body(new ZodValidationPipe(logoutBodySchema)) body: LogoutBodySchema,
  ) {
    await this.logoutService.execute(body.refreshToken)
  }
}
