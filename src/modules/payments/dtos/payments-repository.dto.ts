import type {
  PaymentRecord,
  UpdatePaymentData,
  RecordSucceededChargeData,
} from '../types'

export interface PaymentsRepositoryDTO {
  fetchLatestByTaskId: (taskId: string) => Promise<PaymentRecord | null>
  findByPaymentIntent: (paymentIntent: string) => Promise<PaymentRecord | null>
  updateById: (id: string, data: UpdatePaymentData) => Promise<void>
  recordSucceededCharge: (
    data: RecordSucceededChargeData,
  ) => Promise<PaymentRecord>
}
