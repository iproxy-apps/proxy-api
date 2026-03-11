import { Decimal } from 'src/modules/auth/types'

export type CreatePaymentRecordData = {
  taskId: string
  paymentIntent: string
  amount: number
}

export type PaymentRecord = {
  id: string
  taskId: string
  amount: Decimal
  paymentIntent: string
  refundId?: string | null
  createdAt: Date
  updatedAt: Date
}
