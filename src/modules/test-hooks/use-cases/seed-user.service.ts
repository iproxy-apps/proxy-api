import { hash } from 'bcryptjs'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
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
  constructor(private prisma: PrismaService) {}

  async execute(input: SeedUserInput) {
    const existing = await this.prisma.users.findUnique({
      where: { email: input.email },
    })

    if (existing) {
      throw new AppException(errorDictionary.user.emailExists(input.email))
    }

    const user = await this.prisma.users.create({
      data: {
        name: input.name,
        email: input.email,
        userType: input.userType,
        stripeAccountId: input.stripeAccountId,
        stripeAccountReady: input.stripeAccountReady,
        stripeCustomerId: 'cus_test_seed',
        phoneNumber: '+5511999999999',
        isVerified: true,
        termsAccepted: true,
        password: await hash(input.password, 8),
      },
    })

    return { id: user.id, email: user.email }
  }
}
