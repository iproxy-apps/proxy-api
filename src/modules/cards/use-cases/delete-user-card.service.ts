import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { CardsRepository } from '../repositories/cards.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

type DeleteUserCardData = {
  cardId: string
  userId: string
}

@Injectable()
export class DeleteUserCardService {
  constructor(
    private stripeService: StripeService,
    private cardsRepository: CardsRepository,
  ) {}

  async execute(data: DeleteUserCardData): Promise<void> {
    const { cardId, userId } = data

    const card = await this.cardsRepository.fetchCardById(cardId)
    if (!card) throw new AppException(errorDictionary.card.cardNotFound)

    if (card.userId !== userId) {
      throw new AppException(errorDictionary.card.cannotDeleteCard)
    }

    await this.stripeService.detachPaymentMethod(card.stripeCardId)
    await this.cardsRepository.softDeleteCard(card.id)
  }
}
