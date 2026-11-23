import { JwtService } from '@nestjs/jwt'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { RefreshAccessTokenService } from './refresh-access-token.service'
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository'

type RefreshTokensRepositoryMock = jest.Mocked<
  Pick<RefreshTokensRepository, 'findByHash' | 'rotate' | 'revokeFamily'>
>
type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById'>
>

const liveRow = {
  id: 'row-1',
  userId: 'user-1',
  familyId: 'family-1',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  replacedById: null,
}

describe('RefreshAccessTokenService', () => {
  let service: RefreshAccessTokenService
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>
  let tokens: RefreshTokensRepositoryMock
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    jwtService = { sign: jest.fn().mockReturnValue('signed') }
    tokens = {
      findByHash: jest.fn(),
      rotate: jest.fn(),
      revokeFamily: jest.fn(),
    }
    authRepository = { fetchUserDetailsById: jest.fn() }
    service = new RefreshAccessTokenService(
      jwtService as unknown as JwtService,
      authRepository as unknown as AuthRepository,
      tokens as unknown as RefreshTokensRepository,
    )
  })

  it('revokes the family once and rejects when a rotated token is reused', async () => {
    tokens.findByHash.mockResolvedValue({
      ...liveRow,
      revokedAt: new Date(),
      replacedById: 'row-2',
    })

    await expect(service.execute('t'.repeat(43))).rejects.toMatchObject({
      errorCode: errorDictionary.session.refreshInvalid.errorCode,
    })

    expect(tokens.revokeFamily).toHaveBeenCalledTimes(1)
    expect(tokens.revokeFamily).toHaveBeenCalledWith('family-1')
    expect(tokens.rotate).not.toHaveBeenCalled()
  })

  it('revokes the family once and rejects when the rotation race is lost', async () => {
    tokens.findByHash.mockResolvedValue(liveRow)
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    tokens.rotate.mockResolvedValue(null)

    await expect(service.execute('t'.repeat(43))).rejects.toMatchObject({
      errorCode: errorDictionary.session.refreshInvalid.errorCode,
    })

    expect(tokens.revokeFamily).toHaveBeenCalledTimes(1)
    expect(tokens.revokeFamily).toHaveBeenCalledWith('family-1')
    expect(jwtService.sign).not.toHaveBeenCalled()
  })
})
