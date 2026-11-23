import { Prisma } from '@prisma/client'

import { OwnerUnavailableError } from 'src/common/owner-lock'
import { StripeService } from 'src/stripe/stripe.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { SaveCardService } from './save-card.service'
import { CardsRepository } from '../repositories/cards.repository'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import type { UserCard } from '../types'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'findUserStripeCustomerId'>
>

type CardsRepositoryMock = jest.Mocked<Pick<CardsRepository, 'replaceUserCard'>>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'retrievePaymentMethod' | 'detachPaymentMethod'>
>

type PaymentMethod = Awaited<ReturnType<StripeService['retrievePaymentMethod']>>

const makeCard = (overrides: Partial<UserCard> = {}): UserCard => ({
  id: 'card-1',
  brand: 'visa',
  last4: '4242',
  userId: 'user-1',
  stripeCardId: 'pm_new',
  ...overrides,
})

const makePaymentMethod = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'pm_new',
    customer: 'cus_1',
    card: { brand: 'visa', last4: '4242' },
    ...overrides,
  }) as unknown as PaymentMethod

describe('SaveCardService', () => {
  let service: SaveCardService
  let stripeService: StripeServiceMock
  let authRepository: AuthRepositoryMock
  let cardsRepository: CardsRepositoryMock

  beforeEach(() => {
    stripeService = {
      retrievePaymentMethod: jest.fn(),
      detachPaymentMethod: jest.fn().mockResolvedValue({}),
    }
    authRepository = {
      findUserStripeCustomerId: jest.fn().mockResolvedValue('cus_1'),
    }
    cardsRepository = { replaceUserCard: jest.fn() }

    service = new SaveCardService(
      stripeService as unknown as StripeService,
      authRepository as unknown as AuthRepository,
      cardsRepository as unknown as CardsRepository,
    )
  })

  it('throws user.notFound when the user has no stripe customer id', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue(null)

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(stripeService.retrievePaymentMethod).not.toHaveBeenCalled()
  })

  it('throws notConfirmed when the payment method belongs to another customer', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(
      makePaymentMethod({ customer: 'cus_other' }),
    )

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.notConfirmed.errorCode,
    })

    expect(cardsRepository.replaceUserCard).not.toHaveBeenCalled()
  })

  it('throws notConfirmed when the payment method has no customer', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(
      makePaymentMethod({ customer: null }),
    )

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.notConfirmed.errorCode,
    })
  })

  it('throws notConfirmed when the payment method has no card', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(
      makePaymentMethod({ card: null }),
    )

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.notConfirmed.errorCode,
    })

    expect(cardsRepository.replaceUserCard).not.toHaveBeenCalled()
  })

  it('accepts an expanded customer object', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(
      makePaymentMethod({ customer: { id: 'cus_1' } }),
    )
    cardsRepository.replaceUserCard.mockResolvedValue({
      card: makeCard(),
      previousStripeCardId: null,
    })

    const result = await service.execute({
      userId: 'user-1',
      paymentMethodId: 'pm_new',
    })

    expect(result).toEqual(makeCard())
    expect(cardsRepository.replaceUserCard).toHaveBeenCalledWith({
      userId: 'user-1',
      stripeCardId: 'pm_new',
      brand: 'visa',
      last4: '4242',
    })
    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
  })

  it('detaches only the previous payment method after replacing the card', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(makePaymentMethod())
    cardsRepository.replaceUserCard.mockResolvedValue({
      card: makeCard(),
      previousStripeCardId: 'pm_old',
    })

    await service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' })

    expect(stripeService.detachPaymentMethod).toHaveBeenCalledTimes(1)
    expect(stripeService.detachPaymentMethod).toHaveBeenCalledWith('pm_old')
  })

  it('does not detach when the previous card is the same payment method', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(makePaymentMethod())
    cardsRepository.replaceUserCard.mockResolvedValue({
      card: makeCard(),
      previousStripeCardId: 'pm_new',
    })

    await service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' })

    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
  })

  it('keeps the saved card when detaching the previous one fails', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(makePaymentMethod())
    cardsRepository.replaceUserCard.mockResolvedValue({
      card: makeCard(),
      previousStripeCardId: 'pm_old',
    })
    stripeService.detachPaymentMethod.mockRejectedValue(
      new Error('stripe down'),
    )

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).resolves.toEqual(makeCard())
  })

  it('maps a unique violation to card.alreadyExists', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(makePaymentMethod())
    cardsRepository.replaceUserCard.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.alreadyExists.errorCode,
    })

    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
  })

  it('maps a deleted owner (raised by the repository) to user.notFound', async () => {
    stripeService.retrievePaymentMethod.mockResolvedValue(makePaymentMethod())
    cardsRepository.replaceUserCard.mockRejectedValue(
      new OwnerUnavailableError(),
    )

    await expect(
      service.execute({ userId: 'user-1', paymentMethodId: 'pm_new' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
  })
})
