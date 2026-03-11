import { z } from 'zod'
import { Body, Post, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { User } from 'src/modules/auth/utils/current-user-decorator'
import { CreateTaskService } from '../use-cases/create-task.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const createTaskBodySchema = z.object({
  title: z.string(),
  description: z.string(),
  address: z.object({
    city: z.string(),
    state: z.string(),
    street: z.string(),
    zipCode: z.string(),
    locationLat: z.number(),
    locationLng: z.number(),
  }),
  pricing: z.object({
    offeredPrice: z.number(),
  }),

  cardDetails: z.object({
    savedCard: z.string().optional(),
    token: z.string().optional(),
  }),
})

type CreateTaskBodySchema = z.infer<typeof createTaskBodySchema>

@Controller('/tasks/create')
@UseGuards(JwtAuthGuard)
export class CreateTaskController {
  constructor(private createTaskService: CreateTaskService) {}

  @Post()
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(createTaskBodySchema))
    body: CreateTaskBodySchema,
    @User() user: SessionPayload,
  ) {
    const {
      title,
      description,
      pricing: { offeredPrice },
      address: { city, state, street, zipCode, locationLat, locationLng },
      cardDetails,
    } = body

    await this.createTaskService.execute({
      city,
      title,
      state,
      street,
      zipCode,
      locationLat,
      locationLng,
      description,
      offeredPrice,
      userId: user.sub,
      ...cardDetails,
    })
  }
}
