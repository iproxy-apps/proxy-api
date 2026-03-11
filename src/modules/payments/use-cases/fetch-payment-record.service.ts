import { Injectable } from '@nestjs/common'

import type { PaymentRecord } from '../types'
import { PaymentsRepository } from '../repository/payments.repository'

@Injectable()
export class FetchPaymentRecordService {
  constructor(private paymentsRepository: PaymentsRepository) {}

  async execute(taskId: string): Promise<PaymentRecord | null> {
    return await this.paymentsRepository.fetchPaymentRecord(taskId)
  }
}
