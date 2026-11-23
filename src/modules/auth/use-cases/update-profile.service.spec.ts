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
    )
    expect(result).toEqual({ session: 'signed-token' })
  })

  it('skips undefined keys', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({ userId: 'user-1', name: 'Changed' })

    expect(authRepository.updateUserDetailsById).toHaveBeenCalledWith(
      'user-1',
      { name: 'Changed' },
    )
  })

  it('passes null through to clear the phone', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    jwtService.sign.mockReturnValue('signed-token')

    await service.execute({ userId: 'user-1', phoneNumber: null })

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
      service.execute({ userId: 'user-1', name: 'New Name' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(jwtService.sign).not.toHaveBeenCalled()
  })
})
