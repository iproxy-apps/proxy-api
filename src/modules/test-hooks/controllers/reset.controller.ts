import { Post, HttpCode, Controller, UseGuards } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'

import { PrismaService } from 'src/prisma/prisma.service'
import { TestHooksGuard } from '../test-hooks.guard'
import { TRUNCATE_TABLES } from '../truncate-tables'

@Controller('/__test/reset')
@SkipThrottle({ default: true, auth: true })
@UseGuards(TestHooksGuard)
export class ResetController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async handle() {
    const tables = TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ')

    await this.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
    )
  }
}
