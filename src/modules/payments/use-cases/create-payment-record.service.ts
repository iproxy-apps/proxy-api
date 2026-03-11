import { Injectable } from '@nestjs/common'

import { PaymentsRepository } from '../repository/payments.repository'

import type { CreatePaymentRecordData } from '../types'

@Injectable()
export class CreatePaymentRecordService {
  constructor(private paymentsRepository: PaymentsRepository) {}

  async execute(data: CreatePaymentRecordData): Promise<void> {
    await this.paymentsRepository.createPaymentRecord(data)
  }
}
