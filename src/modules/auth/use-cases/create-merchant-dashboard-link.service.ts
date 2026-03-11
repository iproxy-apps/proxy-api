import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'

@Injectable()
export class CreateMerchantDashboardLinkService {
  constructor(
    private stripeService: StripeService,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(userId: string): Promise<{ dashboardUrl: string }> {
    const userDetails = await this.fetchUserDetailsService.execute(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    if (!userDetails.stripeAccountId) {
      throw new AppException(errorDictionary.user.merchantAccountNotFound)
    }

    try {
      const loginLink = await this.stripeService.createDashboardLoginLink(
        userDetails.stripeAccountId,
      )

      return { dashboardUrl: loginLink.url }
    } catch {
      throw new AppException(errorDictionary.user.merchantDashboardLinkFailed)
    }
  }
}
