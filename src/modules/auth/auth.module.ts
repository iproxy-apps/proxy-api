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
import { DeleteAccountService } from './use-cases/delete-account.service'
import { TasksRepository } from '../tasks/repository/tasks.repository'
import { DeleteAccountController } from './controllers/delete-account.controller'
import { NotificationModule } from 'src/notification/notification.module'
import { CreateAccountService } from './use-cases/create-account.service'
import { UpdateProfileService } from './use-cases/update-profile.service'
import { ResetPasswordService } from './use-cases/reset-password.service'
import { ForgotPasswordService } from './use-cases/forgot-password.service'
import { VerifyResetCodeService } from './use-cases/verify-reset-code.service'
import { AuthenticateController } from './controllers/authenticate.controller'
import { FetchUserDetailsService } from './use-cases/fetch-user-details.service'
import { UpdateProfileController } from './controllers/update-profile.controller'
import { CreateAccountController } from './controllers/create-account.controller'
import { ResetPasswordController } from './controllers/reset-password.controller'
import { ForgotPasswordController } from './controllers/forgot-password.controller'
import { VerifyResetCodeController } from './controllers/verify-reset-code.controller'
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
    NotificationModule.forRoot(),
  ],
  providers: [
    EnvService,
    JwtStrategy,
    PrismaService,
    AuthRepository,
    TasksRepository,
    AuthenticateService,
    DeleteAccountService,
    CreateAccountService,
    ResetPasswordService,
    ForgotPasswordService,
    UpdateProfileService,
    VerifyResetCodeService,
    FetchUserDetailsService,
    CreateMerchantAccountService,
    FetchTransactionHistoryService,
    CreateMerchantDashboardLinkService,
  ],
  controllers: [
    AuthenticateController,
    CreateAccountController,
    DeleteAccountController,
    UpdateProfileController,
    ResetPasswordController,
    ForgotPasswordController,
    VerifyResetCodeController,
    CreateMerchantAccountController,
    FetchTransactionHistoryController,
    FetchMerchantDashboardLinkController,
  ],
})
export class AuthModule {}
