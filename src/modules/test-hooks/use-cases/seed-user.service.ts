import { hash } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

export interface SeedUserInput {
  name: string
  email: string
  password: string
  userType: 'CLIENT' | 'PROXY'
  stripeAccountReady: boolean
  stripeAccountId: string | null
}

@Injectable()
export class SeedUserService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
  ) {}

  async execute(input: SeedUserInput) {
    const existing = await this.prisma.users.findUnique({
      where: { email: input.email },
    })

    if (existing) {
      throw new AppException(errorDictionary.user.emailExists(input.email))
    }

    // Mirrors CreateAccountService: a real Stripe customer, so card/charge
    // flows work against Stripe test mode under dev-stack.sh.
    const userId = randomUUID()
    let stripeCustomerId: string

    try {
      const stripeCustomer = await this.stripeService.searchCustomer(
        input.email,
      )

      if (stripeCustomer.data.length) {
        stripeCustomerId = stripeCustomer.data[0].id
      } else {
        const newCustomer = await this.stripeService.createCustomer(
          input.email,
          input.name,
          userId,
        )
        stripeCustomerId = newCustomer.id
      }
    } catch {
      throw new AppException(errorDictionary.standard)
    }

    const user = await this.prisma.users.create({
      data: {
        id: userId,
        name: input.name,
        email: input.email,
        userType: input.userType,
        stripeAccountId: input.stripeAccountId,
        stripeAccountReady: input.stripeAccountReady,
        stripeCustomerId,
        phoneNumber: '+5511999999999',
        termsAccepted: true,
        password: await hash(input.password, 8),
      },
    })

    return { id: user.id, email: user.email }
  }
}
