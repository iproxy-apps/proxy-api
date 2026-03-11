import { Injectable } from '@nestjs/common'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

import { AuthRepository } from 'src/modules/auth/repository/auth.repository'

import type { FindUserByEmailResult } from 'src/modules/auth/types'

@Injectable()
export class FetchUserDetailsService {
  constructor(private authRepository: AuthRepository) {}

  async execute(userId: string): Promise<FindUserByEmailResult> {
    const userDetails = await this.authRepository.fetchUserDetailsById(userId)

    if (!userDetails) throw new AppException(errorDictionary.user.notFound)

    return userDetails
  }
}
