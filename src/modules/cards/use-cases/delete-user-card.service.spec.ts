import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { CardsRepository } from '../repositories/cards.repository'
import { DeleteUserCardService } from './delete-user-card.service'

import type { UserCard } from '../types'

type CardsRepositoryMock = jest.Mocked<
  Pick<CardsRepository, 'fetchCardById' | 'softDeleteCard'>
>

type StripeServiceMock = jest.Mocked<Pick<StripeService, 'detachPaymentMethod'>>

const makeCard = (overrides: Partial<UserCard> = {}): UserCard => ({
  id: 'card-1',
  brand: 'visa',
  last4: '4242',
  userId: 'user-1',
  stripeCardId: 'pm_123',
  ...overrides,
})

describe('DeleteUserCardService', () => {
  let service: DeleteUserCardService
  let stripeService: StripeServiceMock
  let cardsRepository: CardsRepositoryMock

  beforeEach(() => {
    stripeService = {
      detachPaymentMethod: jest.fn().mockResolvedValue({ id: 'pm_123' }),
    }
    cardsRepository = {
      fetchCardById: jest.fn(),
      softDeleteCard: jest.fn(),
    }

    service = new DeleteUserCardService(
      stripeService as unknown as StripeService,
      cardsRepository as unknown as CardsRepository,
    )
  })

  it('throws cardNotFound when the card does not exist', async () => {
    cardsRepository.fetchCardById.mockResolvedValue(null)

    await expect(
      service.execute({ cardId: 'missing', userId: 'user-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.cardNotFound.errorCode,
    })
    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
    expect(cardsRepository.softDeleteCard).not.toHaveBeenCalled()
  })

  it('throws cannotDeleteCard when the card belongs to another user', async () => {
    cardsRepository.fetchCardById.mockResolvedValue(
      makeCard({ userId: 'user-2' }),
    )

    await expect(
      service.execute({ cardId: 'card-1', userId: 'user-1' }),
    ).rejects.toBeInstanceOf(AppException)
    await expect(
      service.execute({ cardId: 'card-1', userId: 'user-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.cannotDeleteCard.errorCode,
    })
    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
    expect(cardsRepository.softDeleteCard).not.toHaveBeenCalled()
  })

  it('detaches the payment method on Stripe and soft-deletes the card', async () => {
    cardsRepository.fetchCardById.mockResolvedValue(makeCard())

    await service.execute({ cardId: 'card-1', userId: 'user-1' })

    expect(stripeService.detachPaymentMethod).toHaveBeenCalledWith('pm_123')
    expect(cardsRepository.softDeleteCard).toHaveBeenCalledWith('card-1')
  })
})
