import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { JwtService } from '@nestjs/jwt'

import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

import type { FindUserByEmailResult } from '../types'

type AuthRepositoryMock = jest.Mocked<Pick<AuthRepository, 'findByEmail'>>
type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign'>>

const makeUser = async (
  overrides: Partial<FindUserByEmailResult> = {},
): Promise<FindUserByEmailResult> => ({
  id: 'user-1',
  name: 'User',
  avatarUrl: null,
  isVerified: true,
  isDeleted: false,
  documentUrl: null,
  userType: 'CLIENT',
  documentType: null,
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
  let jwtService: JwtServiceMock
  let service: AuthenticateService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    jwtService = { sign: jest.fn() }
    authRepository = { findByEmail: jest.fn() }

    service = new AuthenticateService(
      jwtService as unknown as JwtService,
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when no user matches the email', async () => {
    authRepository.findByEmail.mockResolvedValue(null)

    await expect(
      service.execute({ email: 'missing@test.io', password: 'whatever' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('throws invalidCredentials when the password does not match', async () => {
    authRepository.findByEmail.mockResolvedValue(await makeUser())

    await expect(
      service.execute({ email: 'user@test.io', password: 'wrong-password' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.invalidCredentials.errorCode,
    })

    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('returns a signed session with the expected payload on success', async () => {
    const user = await makeUser()
    jwtService.sign.mockReturnValue('signed-token')
    authRepository.findByEmail.mockResolvedValue(user)

    const result = await service.execute({
      email: 'user@test.io',
      password: 'correct-password',
    })

    expect(result).toEqual({ session: 'signed-token' })
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified,
        termsAccepted: user.termsAccepted,
        stripeAccountId: user.stripeAccountId,
        stripeCustomerId: user.stripeCustomerId,
      }),
    )
  })
})
