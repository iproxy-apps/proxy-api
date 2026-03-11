import { Post, UseGuards, Controller, HttpCode } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { CreateMerchantAccountService } from '../use-cases/create-merchant-account.service'

import type { SessionPayload } from '../utils/jwt.strategy'

@Controller('/auth/merchant-account')
@UseGuards(JwtAuthGuard)
export class CreateMerchantAccountController {
  constructor(
    private createMerchantAccountService: CreateMerchantAccountService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(@User() user: SessionPayload) {
    const userId = user.sub
    return await this.createMerchantAccountService.execute(userId)
  }
}
