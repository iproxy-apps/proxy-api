import {
  Body,
  Post,
  UsePipes,
  HttpCode,
  Controller,
  UseGuards,
} from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { z } from 'zod'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { TestHooksGuard } from '../test-hooks.guard'
import { SeedUserService } from '../use-cases/seed-user.service'

const seedUserBodySchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    name: z.string().default('Usuário Teste'),
    userType: z.enum(['CLIENT', 'PROXY']),
    stripeAccountReady: z.boolean().default(false),
    stripeAccountId: z.string().nullable().default(null),
  })
  .refine((body) => !body.stripeAccountReady || Boolean(body.stripeAccountId), {
    path: ['stripeAccountId'],
    message: 'Informe o stripeAccountId para marcar a conta como pronta.',
  })

type SeedUserBodySchema = z.infer<typeof seedUserBodySchema>

@Controller('/__test/seed-user')
@SkipThrottle()
@UseGuards(TestHooksGuard)
export class SeedUserController {
  constructor(private seedUserService: SeedUserService) {}

  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(seedUserBodySchema))
  async handle(@Body() body: SeedUserBodySchema) {
    return await this.seedUserService.execute(body)
  }
}
