import type { DocumentType, Prisma } from '@prisma/client'

type Decimal = Prisma.Decimal

export type UserType = 'CLIENT' | 'PROXY'

export type CreateAccountInput = {
  name: string
  email: string
  password: string
  userType: UserType
  phoneNumber?: string
  termsAccepted: true
}

export type FindUserByEmailResult = {
  name: string
  id: string
  createdAt: Date
  updatedAt: Date
  email: string
  password: string
  phoneNumber: string | null
  avatarUrl: string | null
  userType: UserType
  documentType: DocumentType | null
  documentUrl: string | null
  isVerified: boolean
  rating: Decimal
  totalTasksCompleted: number
  totalTasksCreated: number
  walletBalance: Decimal
  termsAccepted: boolean
  stripeCustomerId: string | null
  stripeAccountId: string | null
  stripeAccountReady: boolean
  isDeleted: boolean
  payoutIssue: boolean
  cardActionRequired: boolean
}

export type UsersUpdateInput = {
  userId?: string
  name?: string
  userType?: UserType
  password?: string | null | undefined
  avatarUrl?: string | null | undefined
  phoneNumber?: string | null | undefined
}

export type AuthenticateServiceResponse = {
  session: string
}

export type UpdateUserProfileRepositoryPayload = {
  name: string
  userType: UserType
  password?: string
  avatarUrl: string
  phoneNumber: string
}
