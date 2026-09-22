import Stripe from 'stripe'
import { Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { StripeService } from 'src/stripe/stripe.service'
import { errorDictionary } from 'src/exception/error-dictionary'

import { HandlePayoutFailedService } from './handle-payout-failed.service'
import { HandlePaymentFailedService } from './handle-payment-failed.service'
import { HandleAccountUpdatedService } from './handle-account-updated.service'
import { HandleChargeDisputedService } from './handle-charge-disputed.service'
import { HandleChargeRefundedService } from './handle-charge-refunded.service'
import { StripeEventsRepository } from '../repository/stripe-events.repository'
import { HandlePaymentSucceededService } from './handle-payment-succeeded.service'

@Injectable()
export class DispatchStripeEventService {
  private readonly logger = new Logger(DispatchStripeEventService.name)

  constructor(
    private stripeService: StripeService,
    private stripeEventsRepository: StripeEventsRepository,
    private handleAccountUpdatedService: HandleAccountUpdatedService,
    private handleChargeDisputedService: HandleChargeDisputedService,
    private handleChargeRefundedService: HandleChargeRefundedService,
    private handlePaymentFailedService: HandlePaymentFailedService,
    private handlePayoutFailedService: HandlePayoutFailedService,
    private handlePaymentSucceededService: HandlePaymentSucceededService,
  ) {}

  async execute(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event
    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature)
    } catch (error) {
      this.logger.error(
        'Stripe webhook signature verification failed',
        error instanceof Error ? error.stack : String(error),
      )
      throw new AppException(errorDictionary.webhook.invalidSignature)
    }

    this.logger.log(`Dispatching Stripe event ${event.id} (${event.type})`)

    const alreadyProcessed = await this.stripeEventsRepository.wasProcessed(
      event.id,
    )
    if (alreadyProcessed) {
      this.logger.log(`Event ${event.id} already processed, skipping`)
      return
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceededService.execute(event.data.object)
        break
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailedService.execute(event.data.object)
        break
      case 'charge.refunded':
        await this.handleChargeRefundedService.execute(event.data.object)
        break
      case 'charge.dispute.created':
        await this.handleChargeDisputedService.execute(event.data.object)
        break
      case 'account.updated':
        await this.handleAccountUpdatedService.execute(event.data.object)
        break
      case 'payout.failed':
        await this.handlePayoutFailedService.execute(
          event.data.object,
          event.account,
        )
        break
      default:
        this.logger.log(`Ignoring unhandled event type: ${event.type}`)
    }

    await this.stripeEventsRepository.markAsProcessed(event.id, event.type)
  }
}
