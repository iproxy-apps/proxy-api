import { Get, Param, HttpCode, UseGuards, Controller } from '@nestjs/common'
import z from 'zod'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { FetchTaskByIdService } from '../use-cases/fetch-task-by-id.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

@Controller('/tasks')
@UseGuards(JwtAuthGuard)
export class FetchTaskByIdController {
  constructor(private fetchTaskByIdService: FetchTaskByIdService) {}

  @Get(':id')
  @HttpCode(200)
  async handle(
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @User() user: SessionPayload,
  ) {
    return this.fetchTaskByIdService.execute(id, {
      userId: user.sub,
      userType: user.userType,
    })
  }
}
