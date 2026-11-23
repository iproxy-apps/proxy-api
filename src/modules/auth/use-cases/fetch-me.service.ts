import { Injectable } from '@nestjs/common'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import type { MeResponse } from 'src/modules/auth/types'

@Injectable()
export class FetchMeService {
  constructor(private authRepository: AuthRepository) {}

  async execute(userId: string): Promise<MeResponse> {
    const user = await this.authRepository.fetchUserDetailsById(userId)

    if (!user || user.isDeleted) {
      throw new AppException(errorDictionary.user.notFound)
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      userType: user.userType,
      rating: user.rating.toNumber(),
      totalTasksCompleted: user.totalTasksCompleted,
      totalTasksCreated: user.totalTasksCreated,
      walletBalance: user.walletBalance.toNumber(),
      stripeAccountId: user.stripeAccountId,
      stripeAccountReady: user.stripeAccountReady,
      payoutIssue: user.payoutIssue,
      cardActionRequired: user.cardActionRequired,
      termsAccepted: user.termsAccepted,
    }
  }
}
