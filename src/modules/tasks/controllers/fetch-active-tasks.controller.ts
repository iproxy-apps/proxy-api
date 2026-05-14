import { Get, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { FetchActiveTasksService } from '../use-cases/fetch-active-tasks.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

@Controller('/tasks/active')
@UseGuards(JwtAuthGuard)
export class FetchActiveTasksController {
  constructor(private fetchActiveTasksService: FetchActiveTasksService) {}

  @Get()
  @HttpCode(200)
  async handle(@User() user: SessionPayload) {
    return this.fetchActiveTasksService.execute(user.sub)
  }
}
