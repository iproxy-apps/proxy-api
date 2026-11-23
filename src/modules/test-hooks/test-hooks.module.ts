import { Module } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
import { TestHooksGuard } from './test-hooks.guard'
import { SeedUserService } from './use-cases/seed-user.service'
import { ResetController } from './controllers/reset.controller'
import { SeedUserController } from './controllers/seed-user.controller'
import { MarkAccountReadyController } from './controllers/mark-account-ready.controller'

@Module({
  providers: [PrismaService, TestHooksGuard, SeedUserService],
  controllers: [
    ResetController,
    SeedUserController,
    MarkAccountReadyController,
  ],
})
export class TestHooksModule {}
