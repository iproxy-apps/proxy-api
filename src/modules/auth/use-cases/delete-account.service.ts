import { Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { StripeService } from 'src/stripe/stripe.service'

@Injectable()
export class DeleteAccountService {
  private readonly logger = new Logger(DeleteAccountService.name)

  constructor(
    private authRepository: AuthRepository,
    private stripeService: StripeService,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.authRepository.fetchUserDetailsById(userId)
    if (!user || user.isDeleted) {
      throw new AppException(errorDictionary.user.notFound)
    }

    const result = await this.authRepository.deleteAccount(userId)
    if (result.status === 'blocked') {
      throw new AppException(errorDictionary.user.cannotDeleteWithActiveTasks)
    }
    if (result.status === 'already_deleted') {
      throw new AppException(errorDictionary.user.notFound)
    }

    for (const cardId of result.stripeCardIds) {
      try {
        await this.stripeService.detachPaymentMethod(cardId)
      } catch (error) {
        this.logger.error(
          `Failed to detach payment method ${cardId} of deleted user ${userId}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }

    if (result.stripeCustomerId) {
      try {
        await this.stripeService.scrubCustomer(result.stripeCustomerId)
      } catch (error) {
        this.logger.error(
          `Failed to scrub Stripe customer of deleted user ${userId}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }
  }
}
