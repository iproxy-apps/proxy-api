import { Injectable } from '@nestjs/common'

import type { PaymentRecord } from '../types'
import { PaymentsRepository } from '../repository/payments.repository'

@Injectable()
export class UpdatePaymentRecordService {
  constructor(private paymentsRepository: PaymentsRepository) {}

  async execute(taskId: string, data: Partial<PaymentRecord>): Promise<void> {
    await this.paymentsRepository.updatePaymentRecord(taskId, data)
  }
}
