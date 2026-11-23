import { Module } from '@nestjs/common'

import { PaymentsRepository } from './repository/payments.repository'

@Module({
  providers: [PaymentsRepository],
  controllers: [],
  exports: [PaymentsRepository],
})
export class PaymentsModule {}
