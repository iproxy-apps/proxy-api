import { Get, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { RefreshSessionService } from '../use-cases/refresh-session.service'

import type { SessionPayload } from '../utils/jwt.strategy'

@Controller('/auth/session/refresh')
@UseGuards(JwtAuthGuard)
export class RefreshSessionController {
  constructor(private refreshSessionService: RefreshSessionService) {}

  @Get()
  @HttpCode(200)
  async handle(@User() user: SessionPayload) {
    return await this.refreshSessionService.execute(user.sub)
  }
}
