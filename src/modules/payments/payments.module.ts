import { Module } from '@nestjs/common'

import { PaymentsRepository } from './repository/payments.repository'
import { FetchPaymentRecordService } from './use-cases/fetch-payment-record.service'
import { UpdatePaymentRecordService } from './use-cases/update-payment-record.service'

@Module({
  providers: [
    PaymentsRepository,
    UpdatePaymentRecordService,
    FetchPaymentRecordService,
  ],
  controllers: [],
  exports: [
    PaymentsRepository,
    UpdatePaymentRecordService,
    FetchPaymentRecordService,
  ],
})
export class PaymentsModule {}
