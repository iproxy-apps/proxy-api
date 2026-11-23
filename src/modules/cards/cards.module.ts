import { Module } from '@nestjs/common'

import { EnvService } from 'src/env/env.service'
import { StripeModule } from 'src/stripe/stripe.module'
import { CardsRepository } from './repositories/cards.repository'
import { AuthRepository } from '../auth/repository/auth.repository'
import { FetchUserCardService } from './use-cases/fetch-user-card.service'
import { DeleteUserCardService } from './use-cases/delete-user-card.service'
import { FetchUserCardController } from './controllers/fetch-user-card.controller'
import { DeleteUserCardController } from './controllers/delete-user-card.controller'
import { SaveCardService } from './use-cases/save-card.service'
import { CreateSetupIntentService } from './use-cases/create-setup-intent.service'
import { CreateSetupIntentController } from './controllers/create-setup-intent.controller'
import { CreateUserPaymentMethodController } from './controllers/create-user-payment-method.controller'

@Module({
  imports: [StripeModule.forRoot()],
  providers: [
    EnvService,
    AuthRepository,
    CardsRepository,
    FetchUserCardService,
    DeleteUserCardService,
    SaveCardService,
    CreateSetupIntentService,
  ],
  controllers: [
    FetchUserCardController,
    DeleteUserCardController,
    CreateUserPaymentMethodController,
    CreateSetupIntentController,
  ],
})
export class CardsModule {}
