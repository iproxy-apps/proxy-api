import type { PublicUser, TaskRow } from '../repository/task-select'
import type { PaymentRecord } from 'src/modules/payments/types'
import type {
  PaymentResponse,
  PublicUserResponse,
  TaskResponse,
} from '../types'

export const toPublicUser = (user: PublicUser): PublicUserResponse => ({
  ...user,
  rating: user.rating.toNumber(),
})

export const toTaskResponse = (row: TaskRow): TaskResponse => ({
  ...row,
  locationLat: row.locationLat.toNumber(),
  locationLng: row.locationLng.toNumber(),
  offeredPrice: row.offeredPrice.toNumber(),
  platformFee: row.platformFee?.toNumber() ?? null,
  stripeFee: row.stripeFee?.toNumber() ?? null,
  chargedAmount: row.chargedAmount?.toNumber() ?? null,
  proxyEarnings: row.proxyEarnings?.toNumber() ?? null,
  ownerId: toPublicUser(row.ownerId),
})

export const toPaymentResponse = (record: PaymentRecord): PaymentResponse => ({
  id: record.id,
  taskId: record.taskId,
  amount: record.amount.toNumber(),
  status: record.status,
  refundId: record.refundId,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})
