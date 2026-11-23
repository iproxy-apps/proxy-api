import { z } from 'zod'
import { Body, Post, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { User } from 'src/modules/auth/utils/current-user-decorator'
import { ValidateTaskService } from '../use-cases/validate-task.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const validateTaskBodySchema = z.object({
  taskId: z.uuid(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(1).max(500).optional(),
})

type ValidateTaskBodySchema = z.infer<typeof validateTaskBodySchema>

@Controller('/tasks/validate')
@UseGuards(JwtAuthGuard)
export class ValidateTaskController {
  constructor(private validateTaskService: ValidateTaskService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(validateTaskBodySchema))
    body: ValidateTaskBodySchema,
    @User() user: SessionPayload,
  ) {
    const { taskId, rating, comment } = body
    const userId = user.sub

    await this.validateTaskService.execute({ taskId, userId, rating, comment })
  }
}
