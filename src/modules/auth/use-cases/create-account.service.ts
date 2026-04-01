import { hash } from 'bcryptjs'
import { Injectable } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { Prisma } from '@prisma/client'

type UsersCreateInput = Prisma.UsersCreateInput
import { AppException } from 'src/exception/app.exception'
import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

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

  async execute(data: UsersCreateInput): Promise<CreateAccountServiceResponse> {
    const { email, password, name } = data

    const userExists = await this.authRepository.findByEmail(email)

    if (userExists) {
      throw new AppException(errorDictionary.user.emailExists(email))
    }

    const hashedPassword = await hash(password, 8)

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
      ...data,
      name,
      stripeCustomerId,
      password: hashedPassword,
    })

    return await this.authenticateService.execute({
      email,
      password,
    })
  }
}
