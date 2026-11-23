import type {
  PaymentRecord,
  UpdatePaymentData,
  CreatePaymentRecordData,
  RecordSucceededChargeData,
} from '../types'

export interface PaymentsRepositoryDTO {
  createPaymentRecord: (data: CreatePaymentRecordData) => Promise<void>
  fetchPaymentRecord: (taskId: string) => Promise<PaymentRecord | null>
  fetchLatestByTaskId: (taskId: string) => Promise<PaymentRecord | null>
  findByPaymentIntent: (paymentIntent: string) => Promise<PaymentRecord | null>
  updateById: (id: string, data: UpdatePaymentData) => Promise<void>
  recordSucceededCharge: (
    data: RecordSucceededChargeData,
  ) => Promise<PaymentRecord>
}
