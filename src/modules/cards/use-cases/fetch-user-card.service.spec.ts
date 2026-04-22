import { FetchUserCardService } from './fetch-user-card.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { CardsRepository } from '../repositories/cards.repository'

import type { UserCard } from '../types'

type CardsRepositoryMock = jest.Mocked<Pick<CardsRepository, 'fetchUserCard'>>

const makeCard = (overrides: Partial<UserCard> = {}): UserCard => ({
  id: 'card-1',
  brand: 'visa',
  last4: '4242',
  userId: 'user-1',
  stripeCardId: 'pm_123',
  ...overrides,
})

describe('FetchUserCardService', () => {
  let service: FetchUserCardService
  let cardsRepository: CardsRepositoryMock

  beforeEach(() => {
    cardsRepository = { fetchUserCard: jest.fn() }

    service = new FetchUserCardService(
      cardsRepository as unknown as CardsRepository,
    )
  })

  it('throws noSavedCardFound when the repository returns null', async () => {
    cardsRepository.fetchUserCard.mockResolvedValue(null)

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.card.noSavedCardFound.errorCode,
    })
  })

  it('throws noSavedCardFound when the saved card has no stripeCardId', async () => {
    cardsRepository.fetchUserCard.mockResolvedValue(
      makeCard({ stripeCardId: '' }),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.card.noSavedCardFound.errorCode,
    })
  })

  it('returns the card when it exists with a stripeCardId', async () => {
    const card = makeCard()
    cardsRepository.fetchUserCard.mockResolvedValue(card)

    const result = await service.execute('user-1')

    expect(cardsRepository.fetchUserCard).toHaveBeenCalledWith('user-1')
    expect(result).toBe(card)
  })
})
