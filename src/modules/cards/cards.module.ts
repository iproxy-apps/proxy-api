import { Module } from '@nestjs/common'

import { EnvService } from 'src/env/env.service'
import { StripeModule } from 'src/stripe/stripe.module'
import { PrismaService } from 'src/prisma/prisma.service'
import { CardsRepository } from './repositories/cards.repository'
import { AuthRepository } from '../auth/repository/auth.repository'
import { FetchUserCardService } from './use-cases/fetch-user-card.service'
import { FetchUserCardController } from './controllers/fetch-user-card.controller'
import { CreateUserSourceService } from './use-cases/create-user-payment-method.service'
import { CreateUserPaymentMethodController } from './controllers/create-user-payment-method.controller'

@Module({
  imports: [StripeModule.forRoot()],
  providers: [
    EnvService,
    PrismaService,
    AuthRepository,
    CardsRepository,
    FetchUserCardService,
    CreateUserSourceService,
  ],
  controllers: [FetchUserCardController, CreateUserPaymentMethodController],
})
export class CardsModule {}
