import { hash } from 'bcryptjs'
import { addMinutes } from 'date-fns'
import { randomInt } from 'node:crypto'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { NotificationService } from 'src/notification/notification.service'

type ForgotPasswordRequest = {
  email: string
}

@Injectable()
export class ForgotPasswordService {
  constructor(
    private authRepository: AuthRepository,
    private notificationService: NotificationService,
  ) {}

  async execute(data: ForgotPasswordRequest): Promise<{ message: string }> {
    const { email } = data

    const user = await this.authRepository.findByEmail(email)

    if (!user) {
      // Retorna silenciosamente para não expor se o email existe
      return {
        message: 'Se o email existir, um código de recuperação será enviado.',
      }
    }

    const recentCodes = await this.authRepository.countRecentPasswordResetCodes(
      user.id,
    )

    if (recentCodes >= 3) {
      throw new AppException(errorDictionary.passwordReset.tooManyRequests)
    }

    const code = randomInt(100000, 999999).toString()
    const hashedCode = await hash(code, 8)
    const expiresAt = addMinutes(new Date(), 15)

    await this.authRepository.createPasswordResetCode(
      user.id,
      hashedCode,
      expiresAt,
    )

    try {
      await this.notificationService.sendResetCodeByEmail(
        user.email,
        code,
        user.name,
      )

      return {
        message: 'Se o email existir, um código de recuperação será enviado.',
      }
    } catch {
      throw new AppException(errorDictionary.passwordReset.sendFailed)
    }
  }
}
