import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { envSchema } from './env/env'

import { EnvModule } from './env/env.module'
import { AuthModule } from './modules/auth/auth.module'
import { PrismaService } from './prisma/prisma.service'
import { TasksModule } from './modules/tasks/tasks.module'
import { CardsModule } from './modules/cards/cards.module'
import { PaymentsModule } from './modules/payments/payments.module'

@Module({
  providers: [PrismaService],
  imports: [
    ConfigModule.forRoot({
      validate: (env) => envSchema.parse(env),
      isGlobal: true,
    }),

    EnvModule,
    AuthModule,
    TasksModule,
    CardsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
