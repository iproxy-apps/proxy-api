import { compare } from 'bcryptjs'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

type VerifyResetCodeRequest = {
  email: string
  code: string
}

@Injectable()
export class VerifyResetCodeService {
  constructor(private authRepository: AuthRepository) {}

  async execute(data: VerifyResetCodeRequest): Promise<{ message: string }> {
    const { email, code } = data

    const user = await this.authRepository.findByEmail(email)

    if (!user) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    // Only fresh, never-verified codes can be consumed here. Once a code
    // transitions to `verified`, the only further action allowed is to use
    // it in `reset-password` — re-verifying it later returns invalid.
    const resetCode = await this.authRepository.findPendingResetCode(user.id)

    if (!resetCode) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    const codeMatches = await compare(code, resetCode.code)

    if (!codeMatches) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    // Consume the verify step: the code can no longer be re-verified, only
    // used to reset the password.
    await this.authRepository.markPasswordResetCodeAsVerified(resetCode.id)

    return { message: 'Código verificado com sucesso.' }
  }
}
