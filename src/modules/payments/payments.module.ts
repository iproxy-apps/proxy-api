import { Module } from '@nestjs/common'

import { EnvService } from 'src/env/env.service'
import { StripeModule } from 'src/stripe/stripe.module'
import { PrismaService } from 'src/prisma/prisma.service'
import { PaymentsRepository } from './repository/payments.repository'
import { CreatePaymentRecordService } from './use-cases/create-payment-record.service'

@Module({
  imports: [StripeModule.forRoot()],
  providers: [
    EnvService,
    PrismaService,
    PaymentsRepository,
    CreatePaymentRecordService,
  ],
  controllers: [],
})
export class PaymentsModule {}
