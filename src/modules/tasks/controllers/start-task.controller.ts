import { z } from 'zod'
import { Body, Post, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { StartTaskService } from '../use-cases/start-task.service'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { User } from 'src/modules/auth/utils/current-user-decorator'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const startTaskBodySchema = z.object({
  taskId: z.uuid(),
})

type StartTaskBodySchema = z.infer<typeof startTaskBodySchema>

@Controller('/tasks/start')
@UseGuards(JwtAuthGuard)
export class StartTaskController {
  constructor(private startTaskService: StartTaskService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(startTaskBodySchema))
    body: StartTaskBodySchema,
    @User() user: SessionPayload,
  ) {
    const { taskId } = body
    const userId = user.sub

    return await this.startTaskService.execute({ taskId, userId })
  }
}
