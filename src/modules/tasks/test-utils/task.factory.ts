import { Prisma } from '@prisma/client'
import type { TaskRow, FetchTaskUserMappingQueryData } from '../types'

export const makeTaskDetails = (
  overrides: Partial<TaskRow> = {},
): TaskRow => ({
  id: 'task-1',
  title: 'title',
  locationLat: new Prisma.Decimal(0),
  locationLng: new Prisma.Decimal(0),
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  owner: 'client-1',
  offeredPrice: new Prisma.Decimal(100),
  proxyEarnings: null,
  platformFee: null,
  stripeFee: null,
  chargedAmount: null,
  proofImageUrl: null,
  description: 'desc',
  createdAt: new Date(),
  locationAddress: 'addr',
  city: 'São Paulo',
  state: 'SP',
  status: 'available',
  ownerId: {
    rating: new Prisma.Decimal(5),
    name: 'name',
    id: 'client-1',
    avatarUrl: null,
    totalTasksCreated: 0,
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
