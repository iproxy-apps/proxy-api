import z from 'zod'
import { Post, Body, HttpCode, UsePipes, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { AuthenticateService } from '../use-cases/authenticate.service'

const authenticateBodySchema = z.object({
  email: z.email(),
  password: z.string(),
})

type AuthenticateBodySchema = z.infer<typeof authenticateBodySchema>

@Controller('/auth/session')
export class AuthenticateController {
  constructor(private authenticateService: AuthenticateService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(authenticateBodySchema))
  async handle(@Body() body: AuthenticateBodySchema) {
    const { email, password } = body
    return await this.authenticateService.execute({ email, password })
  }
}
