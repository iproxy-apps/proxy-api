import { JwtService } from '@nestjs/jwt'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { UpdateProfileService } from './update-profile.service'
import { errorDictionary } from 'src/exception/error-dictionary'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'updateUserDetailsById'>
>

type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign'>>

const nowSec = () => Math.floor(Date.now() / 1000)
const FUTURE_EXP = nowSec() + 600

describe('UpdateProfileService', () => {
  let jwtService: JwtServiceMock
  let service: UpdateProfileService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    jwtService = { sign: jest.fn() }
    authRepository = {
      fetchUserDetailsById: jest.fn(),
      updateUserDetailsById: jest.fn(),
    }

    service = new UpdateProfileService(
      jwtService as unknown as JwtService,
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(
      service.execute({
        userId: 'missing-user',
        exp: FUTURE_EXP,
        name: 'New Name',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.updateUserDetailsById).not.toHaveBeenCalled()
    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('persists name and phone and returns a new session', async () => {
    const updated = makeUser({
      name: 'New Name',
      phoneNumber: '+5511000000000',
    })

    authRepository.fetchUserDetailsById
      .mockResolvedValueOnce(makeUser())
      .mockResolvedValueOnce(updated)
    jwtService.sign.mockReturnValue('signed-token')

    const result = await service.execute({
      userId: 'user-1',
      exp: FUTURE_EXP,
      name: 'New Name',
      phoneNumber: '+5511000000000',
    })

    expect(authRepository.updateUserDetailsById).toHaveBeenCalledWith(
      'user-1',
      { name: 'New Name', phoneNumber: '+5511000000000' },
    )
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: updated.id,
        name: updated.name,
        phoneNumber: updated.phoneNumber,
      }),
      { expiresIn: expect.any(Number) },
    )
    expect(result).toEqual({ session: 'signed-token' })
  })

  it('skips undefined keys', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({
      userId: 'user-1',
      exp: FUTURE_EXP,
      name: 'Changed',
    })

    expect(authRepository.updateUserDetailsById).toHaveBeenCalledWith(
      'user-1',
      { name: 'Changed' },
    )
  })

  it('passes null through to clear the phone', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({
      userId: 'user-1',
      exp: FUTURE_EXP,
      phoneNumber: null,
    })

    expect(authRepository.updateUserDetailsById).toHaveBeenCalledWith(
      'user-1',
      { phoneNumber: null },
    )
  })

  it('throws notFound when the user disappears between update and refetch', async () => {
    authRepository.fetchUserDetailsById
      .mockResolvedValueOnce(makeUser())
      .mockResolvedValueOnce(null)

    await expect(
      service.execute({ userId: 'user-1', exp: FUTURE_EXP, name: 'New Name' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('signs with the remaining lifetime of the incoming token', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({ userId: 'user-1', exp: nowSec() + 120, name: 'N' })

    const options = jwtService.sign.mock.calls[0][1] as { expiresIn: number }
    expect(options.expiresIn).toBeGreaterThan(110)
    expect(options.expiresIn).toBeLessThanOrEqual(120)
  })
})
