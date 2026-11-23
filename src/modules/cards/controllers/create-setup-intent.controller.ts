import { HttpCode, UseGuards, Controller, Post } from '@nestjs/common'

import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { CreateSetupIntentService } from '../use-cases/create-setup-intent.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

@Controller('/card/setup-intent')
@UseGuards(JwtAuthGuard)
export class CreateSetupIntentController {
  constructor(private createSetupIntentService: CreateSetupIntentService) {}

  @Post()
  @HttpCode(201)
  async handle(@User() user: SessionPayload) {
    return await this.createSetupIntentService.execute(user.sub)
  }
}
