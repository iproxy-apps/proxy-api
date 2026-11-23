import type { Prisma } from '@prisma/client'

type Decimal = Prisma.Decimal

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'disputed'

export type CreatePaymentRecordData = {
  taskId: string
  paymentIntent: string
  amount: number
}

export type PaymentRecord = {
  id: string
  taskId: string
  amount: Decimal
  status: PaymentStatus
  paymentIntent: string
  refundId: string | null
  chargeId: string | null
  disputeId: string | null
  createdAt: Date
  updatedAt: Date
}

export type UpdatePaymentData = {
  status?: PaymentStatus
  refundId?: string | null
  chargeId?: string | null
  disputeId?: string | null
}

export type RecordSucceededChargeData = {
  taskId: string
  paymentIntent: string
  amount: Decimal
  chargeId: string | null
}
