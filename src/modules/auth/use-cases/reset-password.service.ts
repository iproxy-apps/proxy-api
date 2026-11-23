import { compare } from 'bcryptjs'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { hashPassword } from '../utils/password'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

type ResetPasswordRequest = {
  email: string
  code: string
  newPassword: string
}

@Injectable()
export class ResetPasswordService {
  constructor(private authRepository: AuthRepository) {}

  async execute(data: ResetPasswordRequest): Promise<{ message: string }> {
    const { email, code, newPassword } = data

    const user = await this.authRepository.findByEmail(email)

    if (!user) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    // Only an already-verified, not-yet-used code is accepted here. The
    // verify-reset-code step transitions a fresh code to `verified=true`;
    // this endpoint then consumes that verified code one time.
    const resetCode = await this.authRepository.findVerifiedResetCode(user.id)

    if (!resetCode) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    const codeMatches = await compare(code, resetCode.code)

    if (!codeMatches) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    const hashedPassword = await hashPassword(newPassword)

    // Atomic: update password AND mark the code as used. If either fails,
    // both roll back, so the code can never be left in a reusable state.
    await this.authRepository.resetPasswordWithCode(
      user.id,
      hashedPassword,
      resetCode.id,
    )

    return { message: 'Senha redefinida com sucesso.' }
  }
}
