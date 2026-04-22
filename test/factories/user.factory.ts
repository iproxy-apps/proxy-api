import { hash } from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'

import { PrismaService } from 'src/prisma/prisma.service'

import type { INestApplication } from '@nestjs/common'
import type { SessionPayload } from 'src/modules/auth/utils/jwt.strategy'

type CreateUserOverrides = {
  name?: string
  email?: string
  password?: string
  phoneNumber?: string
  userType?: 'CLIENT' | 'PROXY'
  stripeAccountId?: string | null
  stripeCustomerId?: string | null
  stripeAccountReady?: boolean
}

export type CreatedUser = {
  id: string
  name: string
  email: string
  token: string
  phoneNumber: string
  userType: 'CLIENT' | 'PROXY'
  stripeAccountId: string | null
  stripeCustomerId: string | null
}

export const createUser = async (
  app: INestApplication,
  prisma: PrismaService,
  overrides: CreateUserOverrides = {},
): Promise<CreatedUser> => {
  const stripeCustomerId =
    overrides.stripeCustomerId === undefined
      ? 'cus_test_default'
      : overrides.stripeCustomerId
  const name = overrides.name ?? 'Test User'
  const userType = overrides.userType ?? 'CLIENT'
  const stripeAccountId = overrides.stripeAccountId ?? null
  const stripeAccountReady = overrides.stripeAccountReady ?? userType === 'PROXY'
  const phoneNumber = overrides.phoneNumber ?? '+5511999999999'
  const email = overrides.email ?? `user-${Date.now()}-${Math.random()}@test.io`
  const passwordHash = await hash(overrides.password ?? 'password123', 8)

  const user = await prisma.users.create({
    data: {
      name,
      email,
      userType,
      phoneNumber,
      stripeAccountId,
      stripeAccountReady,
      stripeCustomerId,
      isVerified: true,
      termsAccepted: true,
      password: passwordHash,
    },
  })

  const jwt = app.get(JwtService)
  const payload: SessionPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    userType: user.userType,
    avatarUrl: user.avatarUrl,
    rating: Number(user.rating),
    isVerified: user.isVerified,
    documentUrl: user.documentUrl,
    documentType: user.documentType,
    termsAccepted: user.termsAccepted,
    phoneNumber: user.phoneNumber ?? '',
    stripeAccountId: user.stripeAccountId,
    stripeCustomerId: user.stripeCustomerId,
    walletBalance: Number(user.walletBalance),
    totalTasksCreated: user.totalTasksCreated,
    totalTasksCompleted: user.totalTasksCompleted,
  }

  const token = await jwt.signAsync(payload)

  return {
    token,
    id: user.id,
    name: user.name,
    email: user.email,
    userType: user.userType,
    phoneNumber: phoneNumber,
    stripeAccountId: user.stripeAccountId,
    stripeCustomerId: user.stripeCustomerId,
  }
}
