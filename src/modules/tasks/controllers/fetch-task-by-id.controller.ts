import { Get, Param, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { FetchTaskByIdService } from '../use-cases/fetch-task-by-id.service'

@Controller('/tasks')
@UseGuards(JwtAuthGuard)
export class FetchTaskByIdController {
  constructor(private fetchTaskByIdService: FetchTaskByIdService) {}

  @Get(':id')
  @HttpCode(200)
  async handle(@Param('id') id: string) {
    return this.fetchTaskByIdService.execute(id)
  }
}
