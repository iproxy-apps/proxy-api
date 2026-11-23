import { z } from 'zod'
import { Get, HttpCode, UseGuards, Controller, Query } from '@nestjs/common'

import { User } from 'src/modules/auth/utils/current-user-decorator'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { JwtAuthGuard } from 'src/modules/auth/utils/jwt-auth.guard'
import { FetchTasksService } from '../use-cases/fetch-tasks.service'

import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

const querySchema = z.object({
  city: z.string().trim().min(1).max(60),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})

type QuerySchema = z.infer<typeof querySchema>

@Controller('/tasks/fetch')
@UseGuards(JwtAuthGuard)
export class FetchTasksController {
  constructor(private fetchTasksService: FetchTasksService) {}

  @Get()
  @HttpCode(200)
  async handle(
    @Query(new ZodValidationPipe(querySchema))
    query: QuerySchema,
    @User() user: SessionPayload,
  ) {
    if (user.userType !== 'PROXY') {
      throw new AppException(errorDictionary.user.userNotProxy)
    }

    const { page, city } = query
    return this.fetchTasksService.execute({ page, city })
  }
}
