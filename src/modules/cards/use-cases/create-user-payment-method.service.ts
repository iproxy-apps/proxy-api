import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { CardsRepository } from '../repositories/cards.repository'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import { errorDictionary } from 'src/exception/error-dictionary'

import type { CreateUserSourceData } from '../types'

@Injectable()
export class CreateUserSourceService {
  constructor(
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private cardsRepository: CardsRepository,
  ) {}

  async execute(data: CreateUserSourceData): Promise<void> {
    const { userId, token, savedCard } = data

    const stripeCustomerId =
      await this.authRepository.findUserStripeCustomerId(userId)

    if (!stripeCustomerId) {
      throw new AppException(errorDictionary.user.notFound)
    }

    // only need to check if the card exists
    const existingCard = await this.cardsRepository.fetchUserCard(userId)

    if (!token && savedCard) {
      if (
        !existingCard ||
        !existingCard.stripeCardId ||
        existingCard.stripeCardId !== savedCard
      ) {
        throw new AppException(errorDictionary.card.noSavedCardFound)
      }
    }

    if (!savedCard && token) {
      try {
        const paymentMethod = await this.stripeService.createPaymentMethod(token) // prettier-ignore

        if (!paymentMethod || !paymentMethod.card) {
          throw new AppException(errorDictionary.card.creationFailed)
        }

        const stripeCardId = paymentMethod.id
        const brand = paymentMethod.card.brand
        const last4 = paymentMethod.card.last4

        const paymentMethodAttachment =
          await this.stripeService.attachPaymentMethodToCustomer(
            stripeCardId,
            stripeCustomerId,
          )

        if (!paymentMethodAttachment || !paymentMethodAttachment.id) {
          throw new AppException(errorDictionary.card.creationFailed)
        }

        if (!existingCard) {
          await this.cardsRepository.createUserSource({
            brand,
            last4,
            userId,
            token: stripeCardId,
          })
        } else {
          await this.cardsRepository.updateUserSource({
            last4,
            brand,
            stripeCardId,
            id: existingCard.id,
          })
        }
      } catch (error) {
        if (error instanceof AppException) throw error
        throw new AppException(errorDictionary.card.creationFailed)
      }
    }
  }
}
