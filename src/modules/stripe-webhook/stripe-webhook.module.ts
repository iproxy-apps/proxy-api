import { Module } from '@nestjs/common'

import { StripeModule } from 'src/stripe/stripe.module'
import { PrismaService } from 'src/prisma/prisma.service'

import { AuthRepository } from '../auth/repository/auth.repository'
import { TasksRepository } from '../tasks/repository/tasks.repository'
import { StripeEventsRepository } from './repository/stripe-events.repository'
import { StripeWebhookController } from './controllers/stripe-webhook.controller'
import { HandlePayoutFailedService } from './use-cases/handle-payout-failed.service'
import { DispatchStripeEventService } from './use-cases/dispatch-stripe-event.service'
import { HandlePaymentFailedService } from './use-cases/handle-payment-failed.service'
import { HandleAccountUpdatedService } from './use-cases/handle-account-updated.service'
import { HandleChargeDisputedService } from './use-cases/handle-charge-disputed.service'
import { HandleChargeRefundedService } from './use-cases/handle-charge-refunded.service'
import { HandlePaymentSucceededService } from './use-cases/handle-payment-succeeded.service'

@Module({
  imports: [StripeModule.forRoot()],
  providers: [
    PrismaService,
    AuthRepository,
    TasksRepository,
    StripeEventsRepository,
    HandlePayoutFailedService,
    HandlePaymentFailedService,
    DispatchStripeEventService,
    HandleAccountUpdatedService,
    HandleChargeDisputedService,
    HandleChargeRefundedService,
    HandlePaymentSucceededService,
  ],
  controllers: [StripeWebhookController],
})
export class StripeWebhookModule {}
