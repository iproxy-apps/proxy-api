import { Prisma } from '@prisma/client'
import type { FetchTasksResult, FetchTaskUserMappingQueryData } from '../types'

export const makeTaskDetails = (
  overrides: Partial<FetchTasksResult> = {},
): FetchTasksResult => ({
  id: 'task-1',
  title: 'title',
  locationLat: new Prisma.Decimal(0),
  locationLng: new Prisma.Decimal(0),
  startedAt: null,
  owner: 'client-1',
  offeredPrice: new Prisma.Decimal(100),
  proxyEarnings: null,
  platformFee: null,
  proofImageUrl: null,
  description: 'desc',
  createdAt: new Date(),
  locationAddress: 'addr',
  status: 'available',
  ownerId: {
    rating: new Prisma.Decimal(5),
    name: 'name',
    id: 'client-1',
    email: 'email',
    avatarUrl: null,
    isVerified: true,
    phoneNumber: null,
    totalTasksCreated: 0,
    stripeCustomerId: null,
    totalTasksCompleted: 0,
  },
  ...overrides,
})

export const makeTaskMapping = (
  overrides: Partial<FetchTaskUserMappingQueryData> = {},
): FetchTaskUserMappingQueryData => ({
  taskId: 'task-1',
  executorId: 'proxy-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
