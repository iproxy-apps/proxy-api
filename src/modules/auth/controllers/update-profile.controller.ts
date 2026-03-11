import { z } from 'zod'
import { Post, Body, HttpCode, UseGuards, Controller } from '@nestjs/common'

import { User } from '../utils/current-user-decorator'
import { JwtAuthGuard } from '../utils/jwt-auth.guard'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { UpdateProfileService } from '../use-cases/update-profile.service'

import type { SessionPayload } from '../utils/jwt.strategy'

const updateProfileBodySchema = z.object({
  name: z.string(),
  userType: z.enum(['CLIENT', 'PROXY']),
  avatarUrl: z.url().optional().nullable(),
  password: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
})

type UpdateProfileBodySchema = z.infer<typeof updateProfileBodySchema>

@Controller('/auth/update-profile')
@UseGuards(JwtAuthGuard)
export class UpdateProfileController {
  constructor(private updateProfileService: UpdateProfileService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(updateProfileBodySchema))
    body: UpdateProfileBodySchema,
    @User() user: SessionPayload,
  ) {
    return await this.updateProfileService.execute({
      ...body,
      userId: user.sub,
    })
  }
}
