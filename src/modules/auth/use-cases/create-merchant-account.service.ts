import { Injectable } from '@nestjs/common'

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
  constructor(
    private envService: EnvService,
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(userId: string): Promise<CreateMerchantAccountServiceResponse> {
    const userDetails = await this.fetchUserDetailsService.execute(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    const email = userDetails.email
    const phoneNumber = userDetails.phoneNumber ?? ''
    const [firstName, lastName] = userDetails.name.split(' ')

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
        throw new AppException(
          errorDictionary.user.merchantAccountCreationFailed,
        )
      }

      await this.authRepository.updateStripeAccountId(userId, stripeAccountId)
    } else stripeAccountId = userDetails.stripeAccountId

    let callbackUrl: string | null = null

    const nodeEnv = this.envService.get('NODE_ENV')
    if (nodeEnv === 'development') {
      callbackUrl = this.envService.get('DEV_CALLBACK_URL')
    } else callbackUrl = this.envService.get('PROD_CALLBACK_URL')

    try {
      const link = await this.stripeService.linkMerchantAccount({
        account: stripeAccountId,
        url: callbackUrl,
      })

      return { accountLinkUrl: link.url }
    } catch {
      throw new AppException(
        errorDictionary.user.merchantAccountCreationFailed,
      )
    }
  }
}
