import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { hashPassword } from '../utils/password'
import { AppException } from 'src/exception/app.exception'
import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

import type { CreateAccountInput } from '../types'

type CreateAccountServiceResponse = {
  session: string
}

@Injectable()
export class CreateAccountService {
  constructor(
    private stripeService: StripeService,
    private authRepository: AuthRepository,
    private authenticateService: AuthenticateService,
  ) {}

  async execute(
    data: CreateAccountInput,
  ): Promise<CreateAccountServiceResponse> {
    const { email, password, name } = data

    const userExists = await this.authRepository.findByEmail(email)

    if (userExists) {
      throw new AppException(errorDictionary.user.emailExists(email))
    }

    const hashedPassword = await hashPassword(password)

    // stripe logic
    let stripeCustomerId: string | null = null

    try {
      const stripeCustomer = await this.stripeService.searchCustomer(email)

      if (stripeCustomer.data.length) {
        stripeCustomerId = stripeCustomer.data[0].id
      } else {
        const newCustomer = await this.stripeService.createCustomer(email, name)
        stripeCustomerId = newCustomer.id
      }
    } catch {
      throw new AppException(errorDictionary.standard)
    }

    await this.authRepository.create({
      name,
      email,
      password: hashedPassword,
      userType: data.userType,
      phoneNumber: data.phoneNumber,
      termsAccepted: data.termsAccepted,
      stripeCustomerId,
    })

    return await this.authenticateService.execute({
      email,
      password,
    })
  }
}
