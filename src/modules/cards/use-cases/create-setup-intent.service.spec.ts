import { StripeService } from 'src/stripe/stripe.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { CreateSetupIntentService } from './create-setup-intent.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'findUserStripeCustomerId'>
>

type StripeServiceMock = jest.Mocked<Pick<StripeService, 'createSetupIntent'>>

describe('CreateSetupIntentService', () => {
  let service: CreateSetupIntentService
  let stripeService: StripeServiceMock
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    stripeService = { createSetupIntent: jest.fn() }
    authRepository = { findUserStripeCustomerId: jest.fn() }

    service = new CreateSetupIntentService(
      stripeService as unknown as StripeService,
      authRepository as unknown as AuthRepository,
    )
  })

  it('returns the client secret and id of the created SetupIntent', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    stripeService.createSetupIntent.mockResolvedValue({
      id: 'seti_1',
      client_secret: 'seti_1_secret',
    } as Awaited<ReturnType<StripeService['createSetupIntent']>>)

    const result = await service.execute('user-1')

    expect(stripeService.createSetupIntent).toHaveBeenCalledWith('cus_1')
    expect(result).toEqual({
      clientSecret: 'seti_1_secret',
      setupIntentId: 'seti_1',
    })
  })

  it('throws user.notFound when the user has no stripe customer id', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue(null)

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
    expect(stripeService.createSetupIntent).not.toHaveBeenCalled()
  })

  it('throws creationFailed when Stripe returns no client secret', async () => {
    authRepository.findUserStripeCustomerId.mockResolvedValue('cus_1')
    stripeService.createSetupIntent.mockResolvedValue({
      id: 'seti_1',
      client_secret: null,
    } as Awaited<ReturnType<StripeService['createSetupIntent']>>)

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.card.creationFailed.errorCode,
    })
  })
})
