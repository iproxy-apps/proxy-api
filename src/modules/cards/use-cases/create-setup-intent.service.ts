import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import { errorDictionary } from 'src/exception/error-dictionary'

type CreateSetupIntentResult = {
  clientSecret: string
  setupIntentId: string
}

@Injectable()
export class CreateSetupIntentService {
  constructor(
    private stripeService: StripeService,
    private authRepository: AuthRepository,
  ) {}

  async execute(userId: string): Promise<CreateSetupIntentResult> {
    const stripeCustomerId =
      await this.authRepository.findUserStripeCustomerId(userId)

    if (!stripeCustomerId) {
      throw new AppException(errorDictionary.user.notFound)
    }

    const setupIntent = await this.stripeService.createSetupIntent(stripeCustomerId) // prettier-ignore

    if (!setupIntent.client_secret) {
      throw new AppException(errorDictionary.card.creationFailed)
    }

    return {
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    }
  }
}
