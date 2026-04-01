import { compare, hash } from 'bcryptjs'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
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

    const resetCode = await this.authRepository.findValidPasswordResetCode(
      user.id,
    )

    if (!resetCode) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    const codeMatches = await compare(code, resetCode.code)

    if (!codeMatches) {
      throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode)
    }

    const hashedPassword = await hash(newPassword, 8)

    await this.authRepository.updateUserPassword(user.id, hashedPassword)
    await this.authRepository.markPasswordResetCodeAsUsed(resetCode.id)

    return { message: 'Senha redefinida com sucesso.' }
  }
}
