import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'

type UpdateWalletBalanceRequest = {
  userId: string
  amount: number
}

@Injectable()
export class UpdateWalletBalanceService {
  constructor(private authRepository: AuthRepository) {}

  async execute(data: UpdateWalletBalanceRequest): Promise<void> {
    const { userId, amount } = data

    const user = await this.authRepository.fetchUserDetailsById(userId)

    if (!user) {
      throw new AppException(errorDictionary.user.notFound)
    }

    const newBalance = (user.walletBalance?.toNumber() || 0) + amount

    await this.authRepository.updateWalletBalance(userId, newBalance)
  }
}
