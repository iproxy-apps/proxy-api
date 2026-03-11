import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { EnvModule } from 'src/env/env.module'
import { EnvService } from 'src/env/env.service'
import { JwtStrategy } from './utils/jwt.strategy'
import { StripeModule } from 'src/stripe/stripe.module'
import { PrismaService } from 'src/prisma/prisma.service'
import { AuthRepository } from './repository/auth.repository'
import { AuthenticateService } from './use-cases/authenticate.service'
import { CreateAccountService } from './use-cases/create-account.service'
import { UpdateProfileService } from './use-cases/update-profile.service'
import { AuthenticateController } from './controllers/authenticate.controller'
import { FetchUserDetailsService } from './use-cases/fetch-user-details.service'
import { UpdateProfileController } from './controllers/update-profile.controller'
import { CreateAccountController } from './controllers/create-account.controller'
import { CreateMerchantAccountService } from './use-cases/create-merchant-account.service'
import { FetchTransactionHistoryService } from './use-cases/fetch-transaction-history.service'
import { CreateMerchantAccountController } from './controllers/create-merchant-account.controller'
import { FetchTransactionHistoryController } from './controllers/fetch-transaction-history.controller'
import { CreateMerchantDashboardLinkService } from './use-cases/create-merchant-dashboard-link.service'
import { FetchMerchantDashboardLinkController } from './controllers/fetch-merchant-dashboard-link.controller'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [EnvModule],
      inject: [EnvService],
      global: true,
      useFactory(env: EnvService) {
        const privateKey = env.get('JWT_PRIVATE_KEY')
        const publicKey = env.get('JWT_PUBLIC_KEY')

        return {
          signOptions: { algorithm: 'RS256' },
          privateKey: Buffer.from(privateKey, 'base64'),
          publicKey: Buffer.from(publicKey, 'base64'),
        }
      },
    }),
    StripeModule.forRoot(),
  ],
  providers: [
    EnvService,
    JwtStrategy,
    PrismaService,
    AuthRepository,
    AuthenticateService,
    CreateAccountService,
    UpdateProfileService,
    FetchUserDetailsService,
    CreateMerchantAccountService,
    FetchTransactionHistoryService,
    CreateMerchantDashboardLinkService,
  ],
  controllers: [
    AuthenticateController,
    CreateAccountController,
    UpdateProfileController,
    CreateMerchantAccountController,
    FetchTransactionHistoryController,
    FetchMerchantDashboardLinkController,
  ],
})
export class AuthModule {}
