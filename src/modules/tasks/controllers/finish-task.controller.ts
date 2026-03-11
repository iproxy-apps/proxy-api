import { z } from 'zod'
import {
  Body,
  Post,
  HttpCode,
  UseGuards,
  Controller,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { FinishTaskService } from '../use-cases/finish-task.service'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { User } from 'src/modules/auth/utils/current-user-decorator'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const finishTaskBodySchema = z.object({
  taskId: z.string(),
})

type FinishTaskBodySchema = z.infer<typeof finishTaskBodySchema>

@Controller('/tasks/finish')
@UseGuards(JwtAuthGuard)
export class FinishTaskController {
  constructor(private finishTaskService: FinishTaskService) {}

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async handle(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(finishTaskBodySchema))
    body: FinishTaskBodySchema,
    @User() user: SessionPayload,
  ) {
    const { taskId } = body
    const userId = user.sub

    await this.finishTaskService.execute({ taskId, userId, file: file ?? null })
  }
}
