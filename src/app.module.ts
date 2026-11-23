import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { envSchema } from './env/env'

import { EnvModule } from './env/env.module'
import { AuthModule } from './modules/auth/auth.module'
import { PrismaService } from './prisma/prisma.service'
import { TasksModule } from './modules/tasks/tasks.module'
import { CardsModule } from './modules/cards/cards.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { RatingsModule } from './modules/ratings/ratings.module'
import { TestHooksModule } from './modules/test-hooks/test-hooks.module'
import { StripeWebhookModule } from './modules/stripe-webhook/stripe-webhook.module'

@Module({
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({
      validate: (env) => envSchema.parse(env),
      isGlobal: true,
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'auth', ttl: 60_000, limit: 5 },
      ],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),

    EnvModule,
    AuthModule,
    TasksModule,
    CardsModule,
    PaymentsModule,
    RatingsModule,
    StripeWebhookModule,
    TestHooksModule,
  ],
})
export class AppModule {}
