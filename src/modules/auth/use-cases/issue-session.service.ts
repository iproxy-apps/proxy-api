import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import { Injectable } from '@nestjs/common'

import { buildSessionPayload } from '../utils/session-payload'
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository'
import {
  generateRefreshToken,
  refreshTokenExpiry,
} from '../utils/refresh-token'

import type {
  FindUserByEmailResult,
  AuthenticateServiceResponse,
} from '../types'

@Injectable()
export class IssueSessionService {
  constructor(
    private jwt: JwtService,
    private refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async issue(
    user: FindUserByEmailResult,
    familyId: string = randomUUID(),
  ): Promise<AuthenticateServiceResponse> {
    const session = this.jwt.sign(buildSessionPayload(user))
    const { token, tokenHash } = generateRefreshToken()

    await this.refreshTokensRepository.create({
      userId: user.id,
      familyId,
      tokenHash,
      expiresAt: refreshTokenExpiry(new Date()),
    })

    return { session, refreshToken: token }
  }
}
