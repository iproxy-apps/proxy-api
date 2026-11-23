import z from 'zod'
import { Throttle } from '@nestjs/throttler'
import { Post, Body, HttpCode, UsePipes, Controller } from '@nestjs/common'

import { emailSchema } from '../utils/auth-schemas'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { AuthenticateService } from '../use-cases/authenticate.service'

const authenticateBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
})

type AuthenticateBodySchema = z.infer<typeof authenticateBodySchema>

@Controller('/auth/session')
export class AuthenticateController {
  constructor(private authenticateService: AuthenticateService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(authenticateBodySchema))
  async handle(@Body() body: AuthenticateBodySchema) {
    const { email, password } = body
    return await this.authenticateService.execute({ email, password })
  }
}
