import { compare } from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { UpdateProfileService } from './update-profile.service'
import { errorDictionary } from 'src/exception/error-dictionary'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'updateUserDetailsById'>
>

type JwtServiceMock = jest.Mocked<Pick<JwtService, 'sign'>>

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
      service.execute({ userId: 'missing-user', name: 'New Name' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.updateUserDetailsById).not.toHaveBeenCalled()
    expect(jwtService.sign).not.toHaveBeenCalled()
  })

  it('merges provided fields with current user values and returns a new session', async () => {
    const current = makeUser()
    const updated = makeUser({
      name: 'New Name',
      phoneNumber: '+5511000000000',
    })

    authRepository.fetchUserDetailsById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated)
    jwtService.sign.mockReturnValue('signed-token')

    const result = await service.execute({
      userId: 'user-1',
      name: 'New Name',
      phoneNumber: '+5511000000000',
    })

    expect(authRepository.updateUserDetailsById).toHaveBeenCalledWith(
      'user-1',
      {
        avatarUrl: '',
        name: 'New Name',
        userType: current.userType,
        phoneNumber: '+5511000000000',
      },
    )

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: updated.id,
        name: updated.name,
        email: updated.email,
        userType: updated.userType,
        phoneNumber: updated.phoneNumber,
      }),
    )
    expect(result).toEqual({ session: 'signed-token' })
  })

  it('does not send a password field when none is provided', async () => {
    const user = makeUser()
    authRepository.fetchUserDetailsById.mockResolvedValue(user)
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({ userId: 'user-1', name: 'Changed' })

    const [, payload] = authRepository.updateUserDetailsById.mock.calls[0]
    expect(payload).not.toHaveProperty('password')
  })

  it('hashes the password before persisting when provided', async () => {
    const user = makeUser()
    authRepository.fetchUserDetailsById.mockResolvedValue(user)
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({
      userId: 'user-1',
      password: 'plaintext-password',
    })

    const [, payload] = authRepository.updateUserDetailsById.mock.calls[0]
    expect(payload.password).not.toBe('plaintext-password')
    await expect(
      compare('plaintext-password', payload.password as string),
    ).resolves.toBe(true)
  })

  it('throws notFound when the user disappears between update and refetch', async () => {
    authRepository.fetchUserDetailsById
      .mockResolvedValueOnce(makeUser())
      .mockResolvedValueOnce(null)

    await expect(
      service.execute({ userId: 'user-1', name: 'New Name' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(jwtService.sign).not.toHaveBeenCalled()
  })
})
