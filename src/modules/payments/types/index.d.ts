import { Decimal } from 'src/modules/auth/types'

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
  refundId?: string | null
  createdAt: Date
  updatedAt: Date
}
