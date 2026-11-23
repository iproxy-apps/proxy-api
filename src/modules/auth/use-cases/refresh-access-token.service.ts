import { JwtService } from '@nestjs/jwt'
import { Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { buildSessionPayload } from '../utils/session-payload'
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository'
import {
  hashRefreshToken,
  generateRefreshToken,
  refreshTokenExpiry,
} from '../utils/refresh-token'

import type { AuthenticateServiceResponse } from '../types'

@Injectable()
export class RefreshAccessTokenService {
  private readonly logger = new Logger(RefreshAccessTokenService.name)

  constructor(
    private jwt: JwtService,
    private authRepository: AuthRepository,
    private refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async execute(refreshToken: string): Promise<AuthenticateServiceResponse> {
    const invalid = () =>
      new AppException(errorDictionary.session.refreshInvalid)

    const row = await this.refreshTokensRepository.findByHash(
      hashRefreshToken(refreshToken),
    )
    if (!row) throw invalid()

    if (row.revokedAt || row.replacedById) {
      await this.refreshTokensRepository.revokeFamily(row.familyId)
      const info = { userId: row.userId, familyId: row.familyId }
      if (row.replacedById) {
        this.logger.warn({ ...info, reason: 'reuse' })
      } else {
        this.logger.log({ ...info, reason: 'revoked' })
      }
      throw invalid()
    }

    const now = new Date()
    if (row.expiresAt <= now) throw invalid()

    const user = await this.authRepository.fetchUserDetailsById(row.userId)
    if (!user || user.isDeleted) {
      await this.refreshTokensRepository.revokeFamily(row.familyId)
      throw invalid()
    }

    const next = generateRefreshToken()
    const rotated = await this.refreshTokensRepository.rotate(row.id, {
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: next.tokenHash,
      expiresAt: refreshTokenExpiry(now),
    })
    if (!rotated) {
      await this.refreshTokensRepository.revokeFamily(row.familyId)
      throw invalid()
    }

    return {
      session: this.jwt.sign(buildSessionPayload(user)),
      refreshToken: next.token,
    }
  }
}
