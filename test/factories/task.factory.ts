import { PrismaService } from 'src/prisma/prisma.service'
import { breakdownToNumbers, computeCharge } from 'src/common/money'

type CreateTaskOverrides = {
  title?: string
  description?: string
  locationLat?: number
  locationLng?: number
  locationAddress?: string
  offeredPrice?: number
  proxyEarnings?: number | null
  platformFee?: number | null
  stripeFee?: number | null
  chargedAmount?: number | null
  proofImageUrl?: string | null
  transferId?: string | null
  status?:
    | 'available'
    | 'accepted'
    | 'on_the_way'
    | 'in_progress'
    | 'verification_required'
    | 'completed'
    | 'canceled'
    | 'payout_failed'
  startedAt?: Date | null
  completedAt?: Date | null
  canceledAt?: Date | null
}

export const createTask = async (
  prisma: PrismaService,
  ownerId: string,
  overrides: CreateTaskOverrides = {},
) => {
  // defaults mirror a task created through the API; `null` seeds a legacy row
  const fees = breakdownToNumbers(computeCharge(overrides.offeredPrice ?? 50))
  return prisma.tasks.create({
    data: {
      owner: ownerId,
      title: overrides.title ?? 'Task',
      description: overrides.description ?? 'desc',
      locationLat: overrides.locationLat ?? 0,
      locationLng: overrides.locationLng ?? 0,
      locationAddress: overrides.locationAddress ?? 'São Paulo',
      offeredPrice: overrides.offeredPrice ?? 50,
      proxyEarnings:
        overrides.proxyEarnings === undefined
          ? fees.proxyEarnings
          : overrides.proxyEarnings,
      platformFee:
        overrides.platformFee === undefined
          ? fees.platformFee
          : overrides.platformFee,
      stripeFee:
        overrides.stripeFee === undefined ? fees.stripeFee : overrides.stripeFee,
      chargedAmount:
        overrides.chargedAmount === undefined
          ? fees.chargedAmount
          : overrides.chargedAmount,
      proofImageUrl: overrides.proofImageUrl ?? null,
      transferId: overrides.transferId ?? null,
      status: overrides.status ?? 'available',
      startedAt: overrides.startedAt ?? null,
      completedAt: overrides.completedAt ?? null,
      canceledAt: overrides.canceledAt ?? null,
    },
  })
}
