import { Controller, Get, HttpCode } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { PrismaService } from 'src/prisma/prisma.service'

@Controller('/health')
@SkipThrottle()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  async handle(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      throw new AppException(errorDictionary.health.databaseUnavailable)
    }

    return { status: 'ok' }
  }
}
