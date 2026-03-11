import type { CreatePaymentRecordData, PaymentRecord } from '../types'

export interface PaymentsRepositoryDTO {
  createPaymentRecord: (data: CreatePaymentRecordData) => Promise<void>
  fetchPaymentRecord: (taskId: string) => Promise<PaymentRecord | null>
}
