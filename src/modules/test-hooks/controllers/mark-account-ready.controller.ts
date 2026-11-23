import {
  Body,
  Post,
  UsePipes,
  HttpCode,
  Controller,
  UseGuards,
} from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { z } from 'zod'

import { PrismaService } from 'src/prisma/prisma.service'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { ZodValidationPipe } from 'src/pipes/zod-validation.pipe'
import { TestHooksGuard } from '../test-hooks.guard'

const markAccountReadyBodySchema = z.object({
  email: z.email(),
  stripeAccountId: z.string().optional(),
})

type MarkAccountReadyBodySchema = z.infer<typeof markAccountReadyBodySchema>

@Controller('/__test/mark-account-ready')
@SkipThrottle({ default: true, auth: true })
@UseGuards(TestHooksGuard)
export class MarkAccountReadyController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(markAccountReadyBodySchema))
  async handle(@Body() { email, stripeAccountId }: MarkAccountReadyBodySchema) {
    const user = await this.prisma.users.findUnique({ where: { email } })

    if (!user) {
      throw new AppException(errorDictionary.user.notFound)
    }

    // Never leave a user ready without an account, and never overwrite a
    // real Connect account id unless the caller passes one explicitly.
    if (!stripeAccountId && !user.stripeAccountId) {
      throw new AppException({
        statusCode: 400,
        errorCode: 'ACCOUNT_ID_REQUIRED',
        message: 'Informe o stripeAccountId para marcar a conta como pronta.',
      })
    }

    await this.prisma.users.update({
      where: { email },
      data: {
        stripeAccountReady: true,
        ...(stripeAccountId && { stripeAccountId }),
      },
    })
  }
}
