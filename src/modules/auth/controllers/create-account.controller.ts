import { Body, Post, UsePipes, HttpCode, Controller } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { z } from 'zod'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { CreateAccountService } from '../use-cases/create-account.service'

const createAccountBodySchema = z.object({
  name: z.string(),
  email: z.email(),
  password: z.string(),
  userType: z.enum(['CLIENT', 'PROXY']),
  phoneNumber: z.string().optional(),
  avatarUrl: z.url().optional(),
  documentType: z.enum(['RG', 'CPF', 'CNPJ']).optional(),
  documentUrl: z.url().optional(),
  isVerified: z.boolean().optional(),
  rating: z.number().min(0).max(5).optional(),
  termsAccepted: z.boolean(),
  totalTasksCompleted: z.number().optional(),
  totalTasksCreated: z.number().optional(),
  walletBalance: z.number().optional(),
})

type CreateAccountBodySchema = z.infer<typeof createAccountBodySchema>

@Controller('/auth/create')
export class CreateAccountController {
  constructor(private createAccountService: CreateAccountService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(createAccountBodySchema))
  async handle(@Body() body: CreateAccountBodySchema) {
    return await this.createAccountService.execute(body)
  }
}
