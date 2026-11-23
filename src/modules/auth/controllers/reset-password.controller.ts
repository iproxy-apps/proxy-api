import z from 'zod'
import { Throttle } from '@nestjs/throttler'
import { Post, Body, HttpCode, UsePipes, Controller } from '@nestjs/common'

import { emailSchema, passwordSchema } from '../utils/auth-schemas'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { ResetPasswordService } from '../use-cases/reset-password.service'

const resetPasswordBodySchema = z.object({
  email: emailSchema,
  code: z.string().length(6),
  newPassword: passwordSchema,
})

type ResetPasswordBodySchema = z.infer<typeof resetPasswordBodySchema>

@Controller('/auth/reset-password')
export class ResetPasswordController {
  constructor(private resetPasswordService: ResetPasswordService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(resetPasswordBodySchema))
  async handle(@Body() body: ResetPasswordBodySchema) {
    return await this.resetPasswordService.execute({
      email: body.email,
      code: body.code,
      newPassword: body.newPassword,
    })
  }
}
