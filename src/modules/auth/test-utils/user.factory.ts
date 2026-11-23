import { Prisma } from '@prisma/client'

import type { FindUserByEmailResult } from '../types'

export const makeUser = (
  overrides: Partial<FindUserByEmailResult> = {},
): FindUserByEmailResult => ({
  id: 'user-1',
  name: 'User',
  avatarUrl: null,
  isDeleted: false,
  payoutIssue: false,
  cardActionRequired: false,
  isVerified: true,
  phoneNumber: null,
  documentUrl: null,
  password: 'hashed',
  userType: 'CLIENT',
  documentType: null,
  termsAccepted: true,
  totalTasksCreated: 0,
  email: 'user@test.io',
  stripeAccountId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  stripeCustomerId: null,
  totalTasksCompleted: 0,
  stripeAccountReady: false,
  rating: new Prisma.Decimal(0),
  walletBalance: new Prisma.Decimal(0),
  ...overrides,
})
