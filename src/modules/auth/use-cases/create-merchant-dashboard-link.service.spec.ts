import { makeUser } from '../test-utils/user.factory'
import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'
import { CreateMerchantDashboardLinkService } from './create-merchant-dashboard-link.service'

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'createDashboardLoginLink'>
>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

const makeMerchantUser = (overrides: Parameters<typeof makeUser>[0] = {}) =>
  makeUser({
    userType: 'PROXY',
    stripeAccountId: 'acct_existing',
    ...overrides,
  })

describe('CreateMerchantDashboardLinkService', () => {
  let stripeService: StripeServiceMock
  let service: CreateMerchantDashboardLinkService
  let fetchUserDetailsService: FetchUserDetailsServiceMock

  beforeEach(() => {
    fetchUserDetailsService = { execute: jest.fn() }
    stripeService = { createDashboardLoginLink: jest.fn() }

    service = new CreateMerchantDashboardLinkService(
      stripeService as unknown as StripeService,
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

    expect(stripeService.createDashboardLoginLink).not.toHaveBeenCalled()
  })

  it('throws merchantAccountNotFound when user has no stripeAccountId', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(
      makeMerchantUser({ stripeAccountId: null }),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.merchantAccountNotFound.errorCode,
    })

    expect(stripeService.createDashboardLoginLink).not.toHaveBeenCalled()
  })

  it('returns the dashboard url on success', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeMerchantUser())
    stripeService.createDashboardLoginLink.mockResolvedValue({
      url: 'https://stripe.test/dashboard',
    } as Awaited<ReturnType<StripeService['createDashboardLoginLink']>>)

    const result = await service.execute('user-1')

    expect(stripeService.createDashboardLoginLink).toHaveBeenCalledWith(
      'acct_existing',
    )

    expect(result).toEqual({ dashboardUrl: 'https://stripe.test/dashboard' })
  })

  it('throws merchantDashboardLinkFailed when Stripe throws', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeMerchantUser())

    stripeService.createDashboardLoginLink.mockRejectedValue(
      new Error('stripe down'),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.merchantDashboardLinkFailed.errorCode,
    })
  })
})
