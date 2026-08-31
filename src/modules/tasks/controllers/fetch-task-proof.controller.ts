import { createReadStream } from 'fs'
import {
  Controller,
  Get,
  Header,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'

import { User } from 'src/modules/auth/utils/current-user-decorator'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { FetchTaskProofService } from '../use-cases/fetch-task-proof.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

@Controller('/tasks')
@UseGuards(JwtAuthGuard)
export class FetchTaskProofController {
  constructor(private fetchTaskProofService: FetchTaskProofService) {}

  @Get(':id/proof')
  @Header('Cache-Control', 'private, max-age=300')
  async handle(
    @Param('id') id: string,
    @User() user: SessionPayload,
  ): Promise<StreamableFile> {
    const { absolutePath, mimeType } = await this.fetchTaskProofService.execute(
      id,
      { userId: user.sub },
    )

    return new StreamableFile(createReadStream(absolutePath), {
      type: mimeType,
    })
  }
}
