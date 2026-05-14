import {
  Param,
  Delete,
  HttpCode,
  UseGuards,
  Controller,
} from '@nestjs/common'

import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { DeleteUserCardService } from '../use-cases/delete-user-card.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

@Controller('/card')
@UseGuards(JwtAuthGuard)
export class DeleteUserCardController {
  constructor(private deleteUserCardService: DeleteUserCardService) {}

  @Delete(':id')
  @HttpCode(204)
  async handle(@Param('id') id: string, @User() user: SessionPayload) {
    await this.deleteUserCardService.execute({
      cardId: id,
      userId: user.sub,
    })
  }
}
