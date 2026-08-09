import { Get, Param, HttpCode, UseGuards, Controller } from '@nestjs/common'

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
  async handle(@Param('id') id: string, @User() user: SessionPayload) {
    return this.fetchTaskByIdService.execute(id, {
      userId: user.sub,
      userType: user.userType,
    })
  }
}
