import { Prisma } from '@prisma/client'
import { Injectable, Logger } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { CardsRepository } from '../repositories/cards.repository'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import { errorDictionary } from 'src/exception/error-dictionary'

import type { SaveCardData, UserCard } from '../types'

@Injectable()
export class SaveCardService {
  private readonly logger = new Logger(SaveCardService.name)

  constructor(
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private cardsRepository: CardsRepository,
  ) {}

  async execute(data: SaveCardData): Promise<UserCard> {
    const { userId, paymentMethodId } = data

    const stripeCustomerId =
      await this.authRepository.findUserStripeCustomerId(userId)

    if (!stripeCustomerId) {
      throw new AppException(errorDictionary.user.notFound)
    }

    const paymentMethod =
      await this.stripeService.retrievePaymentMethod(paymentMethodId)

    const pmCustomer =
      typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : (paymentMethod.customer?.id ?? null)

    if (pmCustomer !== stripeCustomerId || !paymentMethod.card) {
      throw new AppException(errorDictionary.card.notConfirmed)
    }

    let replaced: Awaited<ReturnType<CardsRepository['replaceUserCard']>>

    try {
      replaced = await this.cardsRepository.replaceUserCard({
        userId,
        stripeCardId: paymentMethod.id,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(errorDictionary.card.alreadyExists)
      }
      throw error
    }

    const { card, previousStripeCardId } = replaced

    if (previousStripeCardId && previousStripeCardId !== paymentMethod.id) {
      try {
        await this.stripeService.detachPaymentMethod(previousStripeCardId)
      } catch (error) {
        this.logger.warn(
          `Failed to detach previous payment method ${previousStripeCardId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return card
  }
}
