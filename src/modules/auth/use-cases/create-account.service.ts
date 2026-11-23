import { Prisma } from '@prisma/client'
import { Injectable, Logger } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { hashPassword } from '../utils/password'
import { AppException } from 'src/exception/app.exception'
import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

import type { CreateAccountInput, AuthenticateServiceResponse } from '../types'

const errorText = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error)

@Injectable()
export class CreateAccountService {
  private readonly logger = new Logger(CreateAccountService.name)

  constructor(
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private authenticateService: AuthenticateService,
  ) {}

  async execute(
    data: CreateAccountInput,
  ): Promise<AuthenticateServiceResponse> {
    const { email, password, name } = data

    const userExists = await this.authRepository.findByEmail(email)

    if (userExists) {
      throw new AppException(errorDictionary.user.emailExists(email))
    }

    const hashedPassword = await hashPassword(password)

    let userId: string

    try {
      const created = await this.authRepository.create({
        name,
        email,
        password: hashedPassword,
        userType: data.userType,
        phoneNumber: data.phoneNumber,
        termsAccepted: data.termsAccepted,
      })
      userId = created.id
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(errorDictionary.user.emailExists(email))
      }
      throw error
    }

    let customerId: string | null = null

    try {
      const customer = await this.stripeService.createCustomer(
        email,
        name,
        userId,
      )
      customerId = customer.id
      await this.authRepository.updateStripeCustomerId(userId, customerId)
    } catch (error) {
      this.logger.error(
        `Stripe customer setup failed for user ${userId} (customer ${customerId ?? 'none'}): ${errorText(error)}`,
      )

      try {
        await this.authRepository.hardDeleteUser(userId)
      } catch (rollbackError) {
        this.logger.error(
          `Rollback failed for user ${userId}; manual cleanup needed: ${errorText(rollbackError)}`,
        )
      }

      throw new AppException(errorDictionary.user.signUpUnavailable)
    }

    return await this.authenticateService.execute({
      email,
      password,
    })
  }
}
