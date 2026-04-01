import z from 'zod'
import { Post, Body, HttpCode, UsePipes, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { ForgotPasswordService } from '../use-cases/forgot-password.service'

const forgotPasswordBodySchema = z.object({
  email: z.email(),
})

type ForgotPasswordBodySchema = z.infer<typeof forgotPasswordBodySchema>

@Controller('/auth/forgot-password')
export class ForgotPasswordController {
  constructor(private forgotPasswordService: ForgotPasswordService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(forgotPasswordBodySchema))
  async handle(@Body() body: ForgotPasswordBodySchema) {
    return await this.forgotPasswordService.execute({ email: body.email })
  }
}
