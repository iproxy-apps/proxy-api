import { Body, Post, UsePipes, HttpCode, Controller } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { z } from 'zod'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { emailSchema, passwordSchema } from '../utils/auth-schemas'
import { CreateAccountService } from '../use-cases/create-account.service'

const createAccountBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    password: passwordSchema,
    userType: z.enum(['CLIENT', 'PROXY']),
    phoneNumber: z.string().trim().min(8).max(20).optional(),
    // Legacy keys still sent by the pre-P3-T09 app: accepted, never read or
    // stored (identity documents are not kept). Removed in the Phase 5 cleanup.
    documentType: z.unknown().optional(),
    documentUrl: z.unknown().optional(),
    termsAccepted: z.literal(true),
  })
  .strict()

type CreateAccountBodySchema = z.infer<typeof createAccountBodySchema>

@Controller('/auth/create')
export class CreateAccountController {
  constructor(private createAccountService: CreateAccountService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(createAccountBodySchema))
  async handle(@Body() body: CreateAccountBodySchema) {
    const { name, email, password, userType, phoneNumber, termsAccepted } = body
    return await this.createAccountService.execute({
      name,
      email,
      password,
      userType,
      phoneNumber,
      termsAccepted,
    })
  }
}
