import { JwtService } from '@nestjs/jwt'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'

import type { AuthenticateServiceResponse } from '../types'

@Injectable()
export class RefreshSessionService {
  constructor(
    private jwt: JwtService,
    private authRepository: AuthRepository,
  ) {}

  async execute(userId: string): Promise<AuthenticateServiceResponse> {
    const user = await this.authRepository.fetchUserDetailsById(userId)

    if (!user) throw new AppException(errorDictionary.user.notFound)

    const session = this.jwt.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
      rating: user.rating,
      userType: user.userType,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
      phoneNumber: user.phoneNumber,
      documentUrl: user.documentUrl,
      documentType: user.documentType,
      termsAccepted: user.termsAccepted,
      walletBalance: user.walletBalance,
      stripeAccountId: user.stripeAccountId,
      stripeAccountReady: user.stripeAccountReady,
      stripeCustomerId: user.stripeCustomerId,
      totalTasksCreated: user.totalTasksCreated,
      totalTasksCompleted: user.totalTasksCompleted,
    })

    return { session }
  }
}
