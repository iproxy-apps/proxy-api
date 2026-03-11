import { z } from 'zod'
import { Body, Post, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { CancelTaskService } from '../use-cases/cancel-task.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const cancelTaskBodySchema = z.object({
  taskId: z.string(),
})

type CancelTaskBodySchema = z.infer<typeof cancelTaskBodySchema>

@Controller('/tasks/cancel')
@UseGuards(JwtAuthGuard)
export class CancelTaskController {
  constructor(private cancelTaskService: CancelTaskService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(cancelTaskBodySchema))
    body: CancelTaskBodySchema,
    @User() user: SessionPayload,
  ) {
    const { taskId } = body
    const userId = user.sub

    await this.cancelTaskService.execute({ taskId, userId })
  }
}
