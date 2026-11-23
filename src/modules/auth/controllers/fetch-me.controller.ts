import { Get, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { FetchMeService } from '../use-cases/fetch-me.service'

import type { SessionPayload } from '../utils/jwt.strategy'

@Controller('/auth/me')
@UseGuards(JwtAuthGuard)
export class FetchMeController {
  constructor(private fetchMeService: FetchMeService) {}

  @Get()
  @HttpCode(200)
  async handle(@User() user: SessionPayload) {
    return await this.fetchMeService.execute(user.sub)
  }
}
