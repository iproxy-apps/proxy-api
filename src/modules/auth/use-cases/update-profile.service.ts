import { hash } from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { buildSessionPayload } from '../utils/session-payload'
import { errorDictionary } from 'src/exception/error-dictionary'

import type {
  UsersUpdateInput,
  AuthenticateServiceResponse,
  UpdateUserProfileRepositoryPayload,
} from '../types'

@Injectable()
export class UpdateProfileService {
  constructor(
    private jwt: JwtService,
    private authRepository: AuthRepository,
  ) {}

  async execute(data: UsersUpdateInput): Promise<AuthenticateServiceResponse> {
    const { userId, password: newPassword, ...rest } = data

    const userDetails = await this.authRepository.fetchUserDetailsById(
      userId as string,
    )

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    const payload: UpdateUserProfileRepositoryPayload = {
      name: rest.name ?? userDetails.name,
      userType: rest.userType ?? userDetails.userType,
      avatarUrl: rest.avatarUrl ?? userDetails.avatarUrl ?? '',
      phoneNumber: rest.phoneNumber ?? userDetails.phoneNumber ?? '',
    }

    if (newPassword) {
      payload.password = await hash(newPassword, 8)
    }

    await this.authRepository.updateUserDetailsById(userId as string, payload)

    const updatedUser = await this.authRepository.fetchUserDetailsById(
      userId as string,
    )

    if (!updatedUser) throw new AppException(errorDictionary.user.notFound)

    const session = this.jwt.sign(buildSessionPayload(updatedUser))

    return { session }
  }
}
