import { Delete, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { DeleteAccountService } from '../use-cases/delete-account.service'

import type { SessionPayload } from '../utils/jwt.strategy'

@Controller('/auth/account')
@UseGuards(JwtAuthGuard)
export class DeleteAccountController {
  constructor(private deleteAccountService: DeleteAccountService) {}

  @Delete()
  @HttpCode(204)
  async handle(@User() user: SessionPayload) {
    await this.deleteAccountService.execute(user.sub)
  }
}
