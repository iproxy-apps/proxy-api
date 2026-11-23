import { Module } from '@nestjs/common'

import { PaymentsRepository } from './repository/payments.repository'
import { CreatePaymentRecordService } from './use-cases/create-payment-record.service'
import { FetchPaymentRecordService } from './use-cases/fetch-payment-record.service'
import { UpdatePaymentRecordService } from './use-cases/update-payment-record.service'

@Module({
  providers: [
    PaymentsRepository,
    CreatePaymentRecordService,
    UpdatePaymentRecordService,
    FetchPaymentRecordService,
  ],
  controllers: [],
  exports: [
    PaymentsRepository,
    CreatePaymentRecordService,
    UpdatePaymentRecordService,
    FetchPaymentRecordService,
  ],
})
export class PaymentsModule {}
