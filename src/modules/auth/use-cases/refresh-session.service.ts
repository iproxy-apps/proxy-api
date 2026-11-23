import { JwtService } from '@nestjs/jwt'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'
import { buildSessionPayload } from '../utils/session-payload'

import type { AccessTokenResponse } from '../types'

@Injectable()
export class RefreshSessionService {
  constructor(
    private jwt: JwtService,
    private authRepository: AuthRepository,
  ) {}

  async execute(userId: string): Promise<AccessTokenResponse> {
    const user = await this.authRepository.fetchUserDetailsById(userId)

    if (!user) throw new AppException(errorDictionary.user.notFound)

    const session = this.jwt.sign(buildSessionPayload(user))

    return { session }
  }
}
