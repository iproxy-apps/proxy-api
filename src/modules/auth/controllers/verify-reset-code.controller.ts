import z from 'zod'
import { Post, Body, HttpCode, UsePipes, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { VerifyResetCodeService } from '../use-cases/verify-reset-code.service'

const verifyResetCodeBodySchema = z.object({
  email: z.email(),
  code: z.string().length(6),
})

type VerifyResetCodeBodySchema = z.infer<typeof verifyResetCodeBodySchema>

@Controller('/auth/verify-reset-code')
export class VerifyResetCodeController {
  constructor(private verifyResetCodeService: VerifyResetCodeService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(verifyResetCodeBodySchema))
  async handle(@Body() body: VerifyResetCodeBodySchema) {
    return await this.verifyResetCodeService.execute({
      email: body.email,
      code: body.code,
    })
  }
}
