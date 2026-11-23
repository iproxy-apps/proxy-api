import { Injectable, Logger } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'

import { EnvService } from 'src/env/env.service'
import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'

type CreateMerchantAccountServiceResponse = {
  stripeAccountId?: string
  accountLinkUrl?: string
}

@Injectable()
export class CreateMerchantAccountService {
  private readonly logger = new Logger(CreateMerchantAccountService.name)

  constructor(
    private envService: EnvService,
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(userId: string): Promise<CreateMerchantAccountServiceResponse> {
    const userDetails = await this.fetchUserDetailsService.execute(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    if (userDetails.userType !== 'PROXY')
      throw new AppException(errorDictionary.user.userNotProxy)

    const email = userDetails.email
    const phoneNumber = userDetails.phoneNumber || undefined
    const [firstName, ...rest] = userDetails.name.trim().split(/\s+/)
    const lastName = rest.join(' ') || undefined

    let stripeAccountId: string | null = null
    if (!userDetails?.stripeAccountId) {
      try {
        const merchantAccount = await this.stripeService.createMerchantAccount({
          email,
          lastName,
          firstName,
          phoneNumber,
        })

        if (!merchantAccount || !merchantAccount.id) {
          throw new AppException(
            errorDictionary.user.merchantAccountCreationFailed,
          )
        }

        stripeAccountId = merchantAccount.id
      } catch (error) {
        if (error instanceof AppException) throw error
        this.logger.error(
          `Stripe createMerchantAccount failed for user ${userId}`,
          error instanceof Error ? error.stack : String(error),
        )
        throw new AppException(
          errorDictionary.user.merchantAccountCreationFailed,
        )
      }

      await this.authRepository.updateStripeAccountId(userId, stripeAccountId)
    } else stripeAccountId = userDetails.stripeAccountId

    const returnUrl = this.envService.get('STRIPE_CONNECT_RETURN_URL')
    const refreshUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}refresh=1`

    try {
      const link = await this.stripeService.linkMerchantAccount({
        account: stripeAccountId,
        returnUrl,
        refreshUrl,
      })

      return { accountLinkUrl: link.url }
    } catch (error) {
      this.logger.error(
        `Stripe linkMerchantAccount failed for user ${userId} (account ${stripeAccountId}, return ${returnUrl})`,
        error instanceof Error ? error.stack : String(error),
      )
      throw new AppException(errorDictionary.user.merchantAccountCreationFailed)
    }
  }
}
