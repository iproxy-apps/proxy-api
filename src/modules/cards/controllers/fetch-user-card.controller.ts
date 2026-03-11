import { HttpCode, UseGuards, Controller, Get } from '@nestjs/common'

import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { FetchUserCardService } from '../use-cases/fetch-user-card.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

@Controller('/card/fetch')
@UseGuards(JwtAuthGuard)
export class FetchUserCardController {
  constructor(private fetchUserCardService: FetchUserCardService) {}

  @Get()
  @HttpCode(200)
  async handle(@User() user: SessionPayload) {
    const userId = user.sub
    return await this.fetchUserCardService.execute(userId)
  }
}
