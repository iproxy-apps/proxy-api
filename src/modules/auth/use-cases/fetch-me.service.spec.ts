import { Prisma } from '@prisma/client'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchMeService } from './fetch-me.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById'>
>

describe('FetchMeService', () => {
  let service: FetchMeService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    authRepository = { fetchUserDetailsById: jest.fn() }

    service = new FetchMeService(authRepository as unknown as AuthRepository)
  })

  it('throws notFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(service.execute('missing')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
  })

  it('throws notFound when the user is deleted', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({ isDeleted: true }),
    )

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
  })

  it('maps the user to the me subset with numeric money and rating', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({
        rating: new Prisma.Decimal('4.25'),
        walletBalance: new Prisma.Decimal('250.5'),
        payoutIssue: true,
        cardActionRequired: true,
      }),
    )

    const result = await service.execute('user-1')

    expect(result).toEqual({
      id: 'user-1',
      name: 'User',
      email: 'user@test.io',
      phoneNumber: null,
      avatarUrl: null,
      userType: 'CLIENT',
      rating: 4.25,
      totalTasksCompleted: 0,
      totalTasksCreated: 0,
      walletBalance: 250.5,
      stripeAccountId: null,
      stripeAccountReady: false,
      payoutIssue: true,
      cardActionRequired: true,
      termsAccepted: true,
    })
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('stripeCustomerId')
  })
})
