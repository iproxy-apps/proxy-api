import { PrismaService } from 'src/prisma/prisma.service'

type CreateTaskOverrides = {
  title?: string
  description?: string
  locationLat?: number
  locationLng?: number
  locationAddress?: string
  offeredPrice?: number
  status?:
    | 'available'
    | 'accepted'
    | 'on_the_way'
    | 'in_progress'
    | 'verification_required'
    | 'completed'
    | 'canceled'
  startedAt?: Date | null
  completedAt?: Date | null
  canceledAt?: Date | null
}

export const createTask = async (
  prisma: PrismaService,
  ownerId: string,
  overrides: CreateTaskOverrides = {},
) =>
  prisma.tasks.create({
    data: {
      owner: ownerId,
      title: overrides.title ?? 'Task',
      description: overrides.description ?? 'desc',
      locationLat: overrides.locationLat ?? 0,
      locationLng: overrides.locationLng ?? 0,
      locationAddress: overrides.locationAddress ?? 'São Paulo',
      offeredPrice: overrides.offeredPrice ?? 50,
      status: overrides.status ?? 'available',
      startedAt: overrides.startedAt ?? null,
      completedAt: overrides.completedAt ?? null,
      canceledAt: overrides.canceledAt ?? null,
    },
  })
