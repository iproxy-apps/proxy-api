import { EnvService } from 'src/env/env.service'
import { makeUser } from '../test-utils/user.factory'
import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'
import { CreateMerchantAccountService } from './create-merchant-account.service'

import type { Env } from 'src/env/env'

type EnvServiceMock = jest.Mocked<Pick<EnvService, 'get'>>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'createMerchantAccount' | 'linkMerchantAccount'>
>

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'updateStripeAccountId'>
>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

const makeMerchantUser = (overrides = {}) =>
  makeUser({
    name: 'John Doe',
    userType: 'PROXY',
    email: 'john@test.io',
    phoneNumber: '+5511999999999',
    ...overrides,
  })

const makeEnvGet =
  (values: Partial<Env>) =>
  <K extends keyof Env>(key: K): Env[K] =>
    values[key] as Env[K]

describe('CreateMerchantAccountService', () => {
  let envService: EnvServiceMock
  let stripeService: StripeServiceMock
  let authRepository: AuthRepositoryMock
  let service: CreateMerchantAccountService
  let fetchUserDetailsService: FetchUserDetailsServiceMock

  beforeEach(() => {
    envService = { get: jest.fn() }
    stripeService = {
      linkMerchantAccount: jest.fn(),
      createMerchantAccount: jest.fn(),
    }
    fetchUserDetailsService = { execute: jest.fn() }
    authRepository = { updateStripeAccountId: jest.fn() }

    service = new CreateMerchantAccountService(
      envService as unknown as EnvService,
      stripeService as unknown as StripeService,
      authRepository as unknown as AuthRepository,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
    )
  })

  it('propagates notFound when the user does not exist', async () => {
    fetchUserDetailsService.execute.mockRejectedValue(
      new AppException(errorDictionary.user.notFound),
    )

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(stripeService.createMerchantAccount).not.toHaveBeenCalled()
    expect(authRepository.updateStripeAccountId).not.toHaveBeenCalled()
    expect(stripeService.linkMerchantAccount).not.toHaveBeenCalled()
  })

  it('rejects a user that is not a PROXY', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(
      makeMerchantUser({ userType: 'CLIENT' }),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.userNotProxy.errorCode,
    })
    expect(stripeService.createMerchantAccount).not.toHaveBeenCalled()
    expect(stripeService.linkMerchantAccount).not.toHaveBeenCalled()
  })

  it('creates and persists a new merchant account when user has none', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeMerchantUser())
    stripeService.createMerchantAccount.mockResolvedValue({
      id: 'acct_new',
    } as Awaited<ReturnType<StripeService['createMerchantAccount']>>)
    stripeService.linkMerchantAccount.mockResolvedValue({
      url: 'https://stripe.test/onboarding',
    } as Awaited<ReturnType<StripeService['linkMerchantAccount']>>)
    envService.get.mockImplementation(
      makeEnvGet({
        STRIPE_CONNECT_RETURN_URL: 'http://dev/callback',
      }),
    )

    const result = await service.execute('user-1')

    expect(stripeService.createMerchantAccount).toHaveBeenCalledWith({
      lastName: 'Doe',
      firstName: 'John',
      email: 'john@test.io',
      phoneNumber: '+5511999999999',
    })
    expect(authRepository.updateStripeAccountId).toHaveBeenCalledWith(
      'user-1',
      'acct_new',
    )
    expect(stripeService.linkMerchantAccount).toHaveBeenCalledWith({
      account: 'acct_new',
      returnUrl: 'http://dev/callback',
      refreshUrl: 'http://dev/callback?refresh=1',
    })
    expect(result).toEqual({ accountLinkUrl: 'https://stripe.test/onboarding' })
  })

  it('reuses the existing stripeAccountId without creating a new one', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(
      makeMerchantUser({ stripeAccountId: 'acct_existing' }),
    )
    stripeService.linkMerchantAccount.mockResolvedValue({
      url: 'https://stripe.test/onboarding',
    } as Awaited<ReturnType<StripeService['linkMerchantAccount']>>)
    envService.get.mockImplementation(
      makeEnvGet({
        STRIPE_CONNECT_RETURN_URL: 'http://prod/callback',
      }),
    )

    const result = await service.execute('user-1')

    expect(stripeService.createMerchantAccount).not.toHaveBeenCalled()
    expect(authRepository.updateStripeAccountId).not.toHaveBeenCalled()
    expect(stripeService.linkMerchantAccount).toHaveBeenCalledWith({
      account: 'acct_existing',
      returnUrl: 'http://prod/callback',
      refreshUrl: 'http://prod/callback?refresh=1',
    })
    expect(result).toEqual({ accountLinkUrl: 'https://stripe.test/onboarding' })
  })

  it('throws merchantAccountCreationFailed when Stripe returns no id', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeMerchantUser())
    stripeService.createMerchantAccount.mockResolvedValue(
      {} as Awaited<ReturnType<StripeService['createMerchantAccount']>>,
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.merchantAccountCreationFailed.errorCode,
    })

    expect(authRepository.updateStripeAccountId).not.toHaveBeenCalled()
    expect(stripeService.linkMerchantAccount).not.toHaveBeenCalled()
  })

  it('throws merchantAccountCreationFailed when Stripe create throws', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeMerchantUser())
    stripeService.createMerchantAccount.mockRejectedValue(
      new Error('stripe down'),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.merchantAccountCreationFailed.errorCode,
    })

    expect(authRepository.updateStripeAccountId).not.toHaveBeenCalled()
    expect(stripeService.linkMerchantAccount).not.toHaveBeenCalled()
  })

  it('throws merchantAccountCreationFailed when linkMerchantAccount fails', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(
      makeMerchantUser({ stripeAccountId: 'acct_existing' }),
    )
    stripeService.linkMerchantAccount.mockRejectedValue(
      new Error('link failed'),
    )
    envService.get.mockImplementation(
      makeEnvGet({
        STRIPE_CONNECT_RETURN_URL: 'http://prod/callback',
      }),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.merchantAccountCreationFailed.errorCode,
    })
  })
})
