import { Module } from '@nestjs/common'

import { StripeModule } from 'src/stripe/stripe.module'
import { TestHooksGuard } from './test-hooks.guard'
import { SeedUserService } from './use-cases/seed-user.service'
import { ResetController } from './controllers/reset.controller'
import { SeedUserController } from './controllers/seed-user.controller'
import { MarkAccountReadyController } from './controllers/mark-account-ready.controller'

@Module({
  imports: [StripeModule.forRoot()],
  providers: [TestHooksGuard, SeedUserService],
  controllers: [
    ResetController,
    SeedUserController,
    MarkAccountReadyController,
  ],
})
export class TestHooksModule {}
