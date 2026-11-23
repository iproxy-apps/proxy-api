import { hash } from 'bcryptjs'
import { addMinutes } from 'date-fns'
import { randomInt } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'

import { EnvService } from 'src/env/env.service'
import { AuthRepository } from '../repository/auth.repository'
import { NotificationService } from 'src/notification/notification.service'

type ForgotPasswordRequest = {
  email: string
}

const GENERIC_RESPONSE = {
  message: 'Se o email existir, um código de recuperação será enviado.',
}

@Injectable()
export class ForgotPasswordService {
  private readonly logger = new Logger(ForgotPasswordService.name)

  constructor(
    private authRepository: AuthRepository,
    private notificationService: NotificationService,
    private env: EnvService,
  ) {}

  async execute(data: ForgotPasswordRequest): Promise<{ message: string }> {
    const { email } = data

    const user = await this.authRepository.findByEmail(email)

    if (!user) {
      return GENERIC_RESPONSE
    }

    // Answer right away so the response time does not reveal whether the
    // account exists; count, send and persist run in a detached job.
    setImmediate(() => {
      void this.deliverCode(user, email)
    })

    return GENERIC_RESPONSE
  }

  private async deliverCode(
    user: { id: string; email: string; name: string },
    email: string,
  ): Promise<void> {
    try {
      const recentCodes =
        await this.authRepository.countRecentPasswordResetCodes(user.id)

      if (recentCodes >= 3) {
        this.logger.warn(`Password reset throttled for user ${user.id}`)
        return
      }

      const code = randomInt(0, 1_000_000).toString().padStart(6, '0')

      try {
        await this.notificationService.sendResetCodeByEmail(
          user.email,
          code,
          user.name,
        )
      } catch (error) {
        this.logger.error(
          `Failed to send password reset email for user ${user.id}`,
          error instanceof Error ? error.stack : undefined,
        )
        return
      }

      const hashedCode = await hash(code, 8)
      const expiresAt = addMinutes(new Date(), 15)

      try {
        await this.authRepository.createPasswordResetCode(
          user.id,
          hashedCode,
          expiresAt,
        )
      } catch (error) {
        this.logger.error(
          `Failed to persist password reset code for user ${user.id}`,
          error instanceof Error ? error.stack : undefined,
        )
        return
      }

      if (this.env.get('NODE_ENV') === 'development') {
        this.logger.debug(`Password reset code for ${email}: ${code}`)
      }
    } catch (error) {
      this.logger.error(
        `Password reset job failed for user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
      )
    }
  }
}
