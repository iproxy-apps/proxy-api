import { Injectable } from '@nestjs/common'

import { CardsRepository } from '../repositories/cards.repository'

import type { UserCard } from '../types'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

@Injectable()
export class FetchUserCardService {
  constructor(private cardsRepository: CardsRepository) {}

  async execute(userId: string): Promise<UserCard> {
    const cardDetails = await this.cardsRepository.fetchUserCard(userId)

    if (!cardDetails || !cardDetails.stripeCardId) {
      throw new AppException(errorDictionary.card.noSavedCardFound)
    }

    return cardDetails
  }
}
