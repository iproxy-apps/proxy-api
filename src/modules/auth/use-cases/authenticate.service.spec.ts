import { compare, hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'

import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { SessionNotIssuableError } from '../repository/refresh-tokens.repository'
import { IssueSessionService } from './issue-session.service'
import { DUMMY_PASSWORD_HASH } from '../utils/password'
import { errorDictionary } from 'src/exception/error-dictionary'

import type { FindUserByEmailResult } from '../types'

jest.mock('bcryptjs', () => {
  const actual = jest.requireActual<typeof import('bcryptjs')>('bcryptjs')
  return { ...actual, compare: jest.fn(actual.compare) }
})

type AuthRepositoryMock = jest.Mocked<Pick<AuthRepository, 'findByEmail'>>
type IssueSessionServiceMock = jest.Mocked<Pick<IssueSessionService, 'issue'>>

const makeUser = async (
  overrides: Partial<FindUserByEmailResult> = {},
): Promise<FindUserByEmailResult> => ({
  id: 'user-1',
  name: 'User',
  avatarUrl: null,
  isDeleted: false,
  payoutIssue: false,
  cardActionRequired: false,
  userType: 'CLIENT',
  termsAccepted: true,
  totalTasksCreated: 0,
  email: 'user@test.io',
  stripeAccountId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  totalTasksCompleted: 0,
  stripeCustomerId: null,
  stripeAccountReady: false,
  phoneNumber: '+5511999999999',
  rating: new Prisma.Decimal(0),
  walletBalance: new Prisma.Decimal(0),
  password: await hash('correct-password', 8),
  ...overrides,
})

describe('AuthenticateService', () => {
  let issueSession: IssueSessionServiceMock
  let service: AuthenticateService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    issueSession = { issue: jest.fn() }
    authRepository = { findByEmail: jest.fn() }

    service = new AuthenticateService(
      issueSession as unknown as IssueSessionService,
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws invalidCredentials and still compares once when no user matches', async () => {
    const compareSpy = jest.mocked(compare)
    compareSpy.mockClear()
    authRepository.findByEmail.mockResolvedValue(null)

    await expect(
      service.execute({ email: 'missing@test.io', password: 'whatever' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.invalidCredentials.errorCode,
    })

    expect(compareSpy).toHaveBeenCalledTimes(1)
    expect(compareSpy).toHaveBeenCalledWith('whatever', DUMMY_PASSWORD_HASH)
    expect(issueSession.issue).not.toHaveBeenCalled()
  })

  it('throws invalidCredentials for a deleted user even with the right password', async () => {
    authRepository.findByEmail.mockResolvedValue(
      await makeUser({ isDeleted: true }),
    )

    await expect(
      service.execute({ email: 'user@test.io', password: 'correct-password' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.invalidCredentials.errorCode,
    })

    expect(issueSession.issue).not.toHaveBeenCalled()
  })

  it('throws invalidCredentials when the password does not match', async () => {
    authRepository.findByEmail.mockResolvedValue(await makeUser())

    await expect(
      service.execute({ email: 'user@test.io', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.invalidCredentials.errorCode,
    })

    expect(issueSession.issue).not.toHaveBeenCalled()
  })

  it('issues a session and refresh token for the user on success', async () => {
    const user = await makeUser()
    issueSession.issue.mockResolvedValue({
      session: 'signed-token',
      refreshToken: 'refresh-token',
    })
    authRepository.findByEmail.mockResolvedValue(user)

    const result = await service.execute({
      email: 'user@test.io',
      password: 'correct-password',
    })

    expect(result).toEqual({
      session: 'signed-token',
      refreshToken: 'refresh-token',
    })
    expect(issueSession.issue).toHaveBeenCalledWith(user)
  })

  it('answers 401 when the session can no longer be issued (password changed mid-login)', async () => {
    const user = await makeUser()
    authRepository.findByEmail.mockResolvedValue(user)
    issueSession.issue.mockRejectedValue(new SessionNotIssuableError())

    await expect(
      service.execute({
        email: 'user@test.io',
        password: 'correct-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.invalidCredentials.errorCode,
    })
  })
})
