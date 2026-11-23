import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { StripeService } from 'src/stripe/stripe.service'
import { DeleteAccountService } from './delete-account.service'
import { makeUser } from '../test-utils/user.factory'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'deleteAccount'>
>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'detachPaymentMethod' | 'scrubCustomer'>
>

describe('DeleteAccountService', () => {
  let service: DeleteAccountService
  let authRepository: AuthRepositoryMock
  let stripeService: StripeServiceMock

  beforeEach(() => {
    authRepository = {
      fetchUserDetailsById: jest.fn(),
      deleteAccount: jest.fn(),
    }
    stripeService = {
      detachPaymentMethod: jest.fn().mockResolvedValue({}),
      scrubCustomer: jest.fn().mockResolvedValue({}),
    }

    service = new DeleteAccountService(
      authRepository as unknown as AuthRepository,
      stripeService as unknown as StripeService,
    )
  })

  it('throws userNotFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(service.execute('missing')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
    expect(authRepository.deleteAccount).not.toHaveBeenCalled()
  })

  it('throws userNotFound when the user is already deleted', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({ isDeleted: true }),
    )

    await expect(service.execute('user-1')).rejects.toBeInstanceOf(AppException)
    expect(authRepository.deleteAccount).not.toHaveBeenCalled()
  })

  it('blocks deletion and skips Stripe when the repository reports blocked', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    authRepository.deleteAccount.mockResolvedValue({ status: 'blocked' })

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.cannotDeleteWithActiveTasks.errorCode,
    })
    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
    expect(stripeService.scrubCustomer).not.toHaveBeenCalled()
  })

  it('throws userNotFound and skips Stripe when a concurrent delete won', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    authRepository.deleteAccount.mockResolvedValue({
      status: 'already_deleted',
    })

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
    expect(stripeService.detachPaymentMethod).not.toHaveBeenCalled()
    expect(stripeService.scrubCustomer).not.toHaveBeenCalled()
  })

  it('detaches every card and scrubs the customer after deleting', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    authRepository.deleteAccount.mockResolvedValue({
      status: 'deleted',
      stripeCardIds: ['pm_1', 'pm_2'],
      stripeCustomerId: 'cus_1',
    })

    await service.execute('user-1')

    expect(authRepository.deleteAccount).toHaveBeenCalledWith('user-1')
    expect(stripeService.detachPaymentMethod).toHaveBeenCalledWith('pm_1')
    expect(stripeService.detachPaymentMethod).toHaveBeenCalledWith('pm_2')
    expect(stripeService.scrubCustomer).toHaveBeenCalledWith('cus_1')
  })

  it('does not scrub when there is no Stripe customer', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    authRepository.deleteAccount.mockResolvedValue({
      status: 'deleted',
      stripeCardIds: [],
      stripeCustomerId: null,
    })

    await service.execute('user-1')

    expect(stripeService.scrubCustomer).not.toHaveBeenCalled()
  })

  it('never fails the request when Stripe calls throw', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    authRepository.deleteAccount.mockResolvedValue({
      status: 'deleted',
      stripeCardIds: ['pm_1', 'pm_2'],
      stripeCustomerId: 'cus_1',
    })
    stripeService.detachPaymentMethod.mockRejectedValueOnce(new Error('boom'))
    stripeService.scrubCustomer.mockRejectedValue(new Error('boom'))

    await expect(service.execute('user-1')).resolves.toBeUndefined()
    expect(stripeService.detachPaymentMethod).toHaveBeenCalledTimes(2)
  })
})
