import { z } from 'zod'

import type { FindUserByEmailResult } from '../types'

export const sessionPayloadSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string(),
  userType: z.enum(['CLIENT', 'PROXY']),
  avatarUrl: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  rating: z.number(),
  walletBalance: z.number(),
  totalTasksCreated: z.number().int(),
  totalTasksCompleted: z.number().int(),
  termsAccepted: z.boolean(),
  stripeAccountId: z.string().nullable(),
  stripeAccountReady: z.boolean(),
  stripeCustomerId: z.string().nullable(),
  payoutIssue: z.boolean(),
  cardActionRequired: z.boolean(),
})

export type SessionPayload = z.infer<typeof sessionPayloadSchema>

export const buildSessionPayload = (
  user: FindUserByEmailResult,
): SessionPayload => ({
  sub: user.id,
  name: user.name,
  email: user.email,
  userType: user.userType,
  avatarUrl: user.avatarUrl,
  phoneNumber: user.phoneNumber,
  rating: user.rating.toNumber(),
  walletBalance: user.walletBalance.toNumber(),
  totalTasksCreated: user.totalTasksCreated,
  totalTasksCompleted: user.totalTasksCompleted,
  termsAccepted: user.termsAccepted,
  stripeAccountId: user.stripeAccountId,
  stripeAccountReady: user.stripeAccountReady,
  stripeCustomerId: user.stripeCustomerId,
  payoutIssue: user.payoutIssue,
  cardActionRequired: user.cardActionRequired,
})

// Remaining lifetime (seconds) of the incoming access token: a re-signed
// token must never outlive the one it replaces.
export const remainingLifetime = (exp: number): number =>
  Math.max(1, exp - Math.floor(Date.now() / 1000))
