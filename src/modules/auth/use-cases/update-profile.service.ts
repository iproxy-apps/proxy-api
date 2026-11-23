import { JwtService } from '@nestjs/jwt'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import {
  buildSessionPayload,
  remainingLifetime,
} from '../utils/session-payload'
import { errorDictionary } from 'src/exception/error-dictionary'

import type {
  UpdateProfileInput,
  AccessTokenResponse,
  UpdateUserProfileRepositoryPayload,
} from '../types'

@Injectable()
export class UpdateProfileService {
  constructor(
    private jwt: JwtService,
    private authRepository: AuthRepository,
  ) {}

  async execute(data: UpdateProfileInput): Promise<AccessTokenResponse> {
    const { userId, exp, name, phoneNumber } = data

    const userDetails = await this.authRepository.fetchUserDetailsById(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    const payload: UpdateUserProfileRepositoryPayload = {}
    if (name !== undefined) payload.name = name
    if (phoneNumber !== undefined) payload.phoneNumber = phoneNumber

    await this.authRepository.updateUserDetailsById(userId, payload)

    const updatedUser = await this.authRepository.fetchUserDetailsById(userId)

    if (!updatedUser) throw new AppException(errorDictionary.user.notFound)

    const session = this.jwt.sign(buildSessionPayload(updatedUser), {
      expiresIn: remainingLifetime(exp),
    })

    return { session }
  }
}
