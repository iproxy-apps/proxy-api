import { StripeService } from 'src/stripe/stripe.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { CardsRepository } from '../repositories/cards.repository'
import { CreateUserSourceService } from './create-user-payment-method.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import type { UserCard } from '../types'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'findUserStripeCustomerId'>
>

type CardsRepositoryMock = jest.Mocked<
  Pick<
    CardsRepository,
    'fetchUserCard' | 'createUserSource' | 'updateUserSource'
  >
>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'createPaymentMethod' | 'attachPaymentMethodToCustomer'>
>

const makeCard = (overrides: Partial<UserCard> = {}): UserCard => ({
  id: 'card-1',
  brand: 'visa',
  last4: '4242',
  userId: 'user-1',
  stripeCardId: 'pm_existing',
  ...overrides,
})

describe('CreateUserSourceService', () => {
  let service: CreateUserSourceService
  let stripeService: StripeServiceMock
  let authRepository: AuthRepositoryMock
  let cardsRepository: CardsRepositoryMock

  beforeEach(() => {
    stripeService = {
      createPaymentMethod: jest.fn(),
      attachPaymentMethodToCustomer: jest.fn(),
    }
    authRepository = { findUserStripeCustomerId: jest.fn() }
    cardsRepository = {
      fetchUserCard: jest.fn(),
      createUserSource: jest.fn(),
      updateUserSource: jest.fn(),
    }

    service = new CreateUserSourceService(
      stripeService as unknown as StripeService,
      authRepository as unknown as AuthRepository,
      cardsRepository as unknown as CardsRepository,
    )
  })

  it('throws user.notFound when the user has no stripe customer id', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue(null)

    await expect(
      service.execute({ userId: 'user-1', token: 'tok_123' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(stripeService.createPaymentMethod).not.toHaveBeenCalled()
  })

  it('is a no-op when neither token nor savedCard is provided', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(makeCard())

    await service.execute({ userId: 'user-1' })

    expect(stripeService.createPaymentMethod).not.toHaveBeenCalled()
    expect(cardsRepository.createUserSource).not.toHaveBeenCalled()
    expect(cardsRepository.updateUserSource).not.toHaveBeenCalled()
  })

  it('throws noSavedCardFound when savedCard is provided but no card exists', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(null)

    await expect(
      service.execute({ userId: 'user-1', savedCard: 'pm_saved' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.noSavedCardFound.errorCode,
    })
  })

  it('throws noSavedCardFound when savedCard does not match the stored card', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(
      makeCard({ stripeCardId: 'pm_other' }),
    )

    await expect(
      service.execute({ userId: 'user-1', savedCard: 'pm_saved' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.noSavedCardFound.errorCode,
    })
  })

  it('accepts savedCard when it matches the stored card (no-op)', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(
      makeCard({ stripeCardId: 'pm_saved' }),
    )

    await service.execute({ userId: 'user-1', savedCard: 'pm_saved' })

    expect(stripeService.createPaymentMethod).not.toHaveBeenCalled()
    expect(cardsRepository.createUserSource).not.toHaveBeenCalled()
    expect(cardsRepository.updateUserSource).not.toHaveBeenCalled()
  })

  it('creates a new card when a token is provided and no card exists yet', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(null)
    stripeService.createPaymentMethod.mockResolvedValue({
      id: 'pm_new',
      card: { brand: 'visa', last4: '4242' },
    } as Awaited<ReturnType<StripeService['createPaymentMethod']>>)
    stripeService.attachPaymentMethodToCustomer.mockResolvedValue({
      id: 'pm_new',
    } as Awaited<ReturnType<StripeService['attachPaymentMethodToCustomer']>>)

    await service.execute({ userId: 'user-1', token: 'tok_123' })

    expect(stripeService.createPaymentMethod).toHaveBeenCalledWith('tok_123')
    expect(stripeService.attachPaymentMethodToCustomer).toHaveBeenCalledWith(
      'pm_new',
      'cus_1',
    )
    expect(cardsRepository.createUserSource).toHaveBeenCalledWith({
      brand: 'visa',
      last4: '4242',
      token: 'pm_new',
      userId: 'user-1',
    })
    expect(cardsRepository.updateUserSource).not.toHaveBeenCalled()
  })

  it('updates the existing card when a token is provided and a card already exists', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(makeCard())
    stripeService.createPaymentMethod.mockResolvedValue({
      id: 'pm_new',
      card: { brand: 'mastercard', last4: '0001' },
    } as Awaited<ReturnType<StripeService['createPaymentMethod']>>)
    stripeService.attachPaymentMethodToCustomer.mockResolvedValue({
      id: 'pm_new',
    } as Awaited<ReturnType<StripeService['attachPaymentMethodToCustomer']>>)

    await service.execute({ userId: 'user-1', token: 'tok_123' })

    expect(cardsRepository.updateUserSource).toHaveBeenCalledWith({
      id: 'card-1',
      last4: '0001',
      brand: 'mastercard',
      stripeCardId: 'pm_new',
    })
    expect(cardsRepository.createUserSource).not.toHaveBeenCalled()
  })

  it('throws creationFailed when the payment method returned has no card', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(null)
    stripeService.createPaymentMethod.mockResolvedValue({
      card: null,
      id: 'pm_new',
    } as unknown as Awaited<ReturnType<StripeService['createPaymentMethod']>>)

    await expect(
      service.execute({ userId: 'user-1', token: 'tok_123' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.creationFailed.errorCode,
    })

    expect(stripeService.attachPaymentMethodToCustomer).not.toHaveBeenCalled()
    expect(cardsRepository.createUserSource).not.toHaveBeenCalled()
  })

  it('throws creationFailed when the attachment does not return an id', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(null)
    stripeService.createPaymentMethod.mockResolvedValue({
      id: 'pm_new',
      card: { brand: 'visa', last4: '4242' },
    } as Awaited<ReturnType<StripeService['createPaymentMethod']>>)
    stripeService.attachPaymentMethodToCustomer.mockResolvedValue(
      {} as Awaited<ReturnType<StripeService['attachPaymentMethodToCustomer']>>,
    )

    await expect(
      service.execute({ userId: 'user-1', token: 'tok_123' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.creationFailed.errorCode,
    })

    expect(cardsRepository.createUserSource).not.toHaveBeenCalled()
  })

  it('throws creationFailed when Stripe throws during payment method creation', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    cardsRepository.fetchUserCard.mockResolvedValue(null)
    stripeService.createPaymentMethod.mockRejectedValue(
      new Error('stripe down'),
    )

    await expect(
      service.execute({ userId: 'user-1', token: 'tok_123' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.card.creationFailed.errorCode,
    })
  })
})
