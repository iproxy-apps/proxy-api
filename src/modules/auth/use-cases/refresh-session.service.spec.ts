import { JwtService } from '@nestjs/jwt'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { RefreshSessionService } from './refresh-session.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById'>
>
type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign'>>

const nowSec = () => Math.floor(Date.now() / 1000)
const FUTURE_EXP = nowSec() + 600

describe('RefreshSessionService', () => {
  let jwtService: JwtServiceMock
  let service: RefreshSessionService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    jwtService = { sign: jest.fn() }
    authRepository = { fetchUserDetailsById: jest.fn() }

    service = new RefreshSessionService(
      jwtService as unknown as JwtService,
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when the user no longer exists', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(
      service.execute('missing-user', FUTURE_EXP),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('signs a new session with the current user snapshot including stripeAccountReady', async () => {
    const user = makeUser({
      stripeAccountReady: true,
      stripeAccountId: 'acct_123',
    })
    jwtService.sign.mockReturnValue('signed-token')
    authRepository.fetchUserDetailsById.mockResolvedValue(user)

    const result = await service.execute(user.id, FUTURE_EXP)

    expect(result).toEqual({ session: 'signed-token' })
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: user.id,
        email: user.email,
        userType: user.userType,
        stripeAccountId: user.stripeAccountId,
        stripeAccountReady: true,
        rating: 0,
      }),
      { expiresIn: expect.any(Number) },
    )
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.not.objectContaining({ documentType: expect.anything() }),
      expect.anything(),
    )
  })

  it('keeps the incoming exp: signs with the remaining lifetime, never the default', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute('user-1', nowSec() + 120)

    const options = jwtService.sign.mock.calls[0][1] as { expiresIn: number }
    expect(options.expiresIn).toBeGreaterThan(110)
    expect(options.expiresIn).toBeLessThanOrEqual(120)
  })

  it('clamps an already-expired exp to 1 second', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute('user-1', nowSec() - 50)

    expect(jwtService.sign.mock.calls[0][1]).toEqual({ expiresIn: 1 })
  })
})
