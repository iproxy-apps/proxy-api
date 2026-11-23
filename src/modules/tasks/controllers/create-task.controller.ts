import { z } from 'zod'
import { Body, Post, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { MIN_OFFERED_PRICE, MAX_OFFERED_PRICE } from 'src/common/money'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { User } from 'src/modules/auth/utils/current-user-decorator'
import { CreateTaskService } from '../use-cases/create-task.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const createTaskBodySchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(1000),
  address: z.object({
    city: z.string().trim().min(1),
    state: z.string().trim().length(2),
    street: z.string().trim().min(1),
    zipCode: z.string().trim().min(8).max(9),
    locationLat: z.number().min(-90).max(90),
    locationLng: z.number().min(-180).max(180),
  }),
  pricing: z.object({
    offeredPrice: z
      .number()
      .min(MIN_OFFERED_PRICE)
      .max(MAX_OFFERED_PRICE)
      .multipleOf(0.01),
  }),
  cardDetails: z.union([
    z.object({ savedCard: z.string().min(1) }).strict(),
    z.object({ paymentMethodId: z.string().min(1) }).strict(),
  ]),
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

    return this.createTaskService.execute({
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
