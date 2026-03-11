import { Get, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { CreateMerchantDashboardLinkService } from '../use-cases/create-merchant-dashboard-link.service'

import type { SessionPayload } from '../utils/jwt.strategy'

@Controller('/auth/merchant-dashboard')
@UseGuards(JwtAuthGuard)
export class FetchMerchantDashboardLinkController {
  constructor(
    private createMerchantDashboardLinkService: CreateMerchantDashboardLinkService,
  ) {}

  @Get()
  async handle(@User() user: SessionPayload) {
    const userId = user.sub
    return await this.createMerchantDashboardLinkService.execute(userId)
  }
}
