import type { Prisma } from '@prisma/client'

export const publicUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  rating: true,
  totalTasksCreated: true,
} as const

export const taskSelect = {
  id: true,
  title: true,
  description: true,
  city: true,
  state: true,
  locationAddress: true,
  locationLat: true,
  locationLng: true,
  offeredPrice: true,
  platformFee: true,
  stripeFee: true,
  chargedAmount: true,
  proxyEarnings: true,
  proofImageUrl: true,
  owner: true,
  status: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  canceledAt: true,
  ownerId: { select: publicUserSelect },
} as const

export type TaskRow = Prisma.TasksGetPayload<{ select: typeof taskSelect }>
export type PublicUser = Prisma.UsersGetPayload<{
  select: typeof publicUserSelect
}>
