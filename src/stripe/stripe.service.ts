import Stripe from 'stripe'
import { Inject, Injectable } from '@nestjs/common'

import type {
  LinkMerchantAccountData,
  CreateTransferData,
  ChargeSavedCardData,
  CreateMerchantAccountData,
} from './types'

@Injectable()
export class StripeService {
  private stripe: Stripe

  constructor(
    @Inject('STRIPE_SECRET_KEY')
    private readonly apiKey: string,
    @Inject('STRIPE_WEBHOOK_SECRET')
    private readonly webhookSecret: string,
    @Inject('STRIPE_CONNECT_WEBHOOK_SECRET')
    private readonly connectWebhookSecret: string | null,
  ) {
    this.stripe = new Stripe(this.apiKey, {
      apiVersion: '2025-12-15.clover',
    })
  }

  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      )
    } catch (firstError) {
      if (this.connectWebhookSecret === null) throw firstError
      try {
        return this.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          this.connectWebhookSecret,
        )
      } catch {
        // surface the platform-secret failure, not the fallback's
        throw firstError
      }
    }
  }

  async createSetupIntent(customer: string): Promise<Stripe.SetupIntent> {
    return await this.stripe.setupIntents.create({
      customer,
      usage: 'off_session',
      payment_method_types: ['card'],
    })
  }

  // Creates and confirms in one call with Stripe's default automatic capture (D3):
  // a `succeeded` answer is a final charge. Never request manual capture here.
  async chargeSavedCard(
    data: ChargeSavedCardData,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.create(
      {
        amount: data.amount,
        currency: 'brl',
        customer: data.customer,
        payment_method: data.paymentMethod,
        payment_method_types: ['card'],
        confirm: true,
        off_session: true,
        transfer_group: data.taskId,
        metadata: {
          taskId: data.taskId,
          proxyId: data.proxyId,
          claimedAt: data.claimedAt,
        },
      },
      { idempotencyKey },
    )
  }

  // Always a full refund (D7): no `amount`.
  async refundPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<Stripe.Refund> {
    return await this.stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey },
    )
  }

  async createTransferFromCharge(
    data: CreateTransferData,
    idempotencyKey: string,
  ): Promise<Stripe.Transfer> {
    return await this.stripe.transfers.create(
      {
        amount: data.amount,
        currency: 'brl',
        destination: data.destination,
        source_transaction: data.sourceTransaction,
        transfer_group: data.transferGroup,
        metadata: { taskId: data.taskId },
      },
      { idempotencyKey },
    )
  }

  async searchCustomer(email: string) {
    return await this.stripe.customers.search({
      query: `email:'${email}'`,
    })
  }

  async createCustomer(email: string, name: string) {
    return await this.stripe.customers.create({
      email,
      name,
    })
  }

  async retrievePaymentMethod(paymentMethodId: string) {
    return await this.stripe.paymentMethods.retrieve(paymentMethodId)
  }

  async detachPaymentMethod(paymentMethodId: string) {
    return await this.stripe.paymentMethods.detach(paymentMethodId)
  }

  async createMerchantAccount(data: CreateMerchantAccountData) {
    const { email, lastName, firstName, phoneNumber } = data
    return await this.stripe.accounts.create({
      email,
      business_type: 'individual',
      business_profile: {
        product_description: 'Merchant account for a proxy',
      },
      individual: {
        first_name: firstName,
        last_name: lastName,
        phone: phoneNumber,
      },
      controller: {
        stripe_dashboard: {
          type: 'express',
        },
        fees: {
          payer: 'application',
        },
        losses: {
          payments: 'application',
        },
      },
    })
  }

  async linkMerchantAccount({ account, url }: LinkMerchantAccountData) {
    return await this.stripe.accountLinks.create({
      account,
      return_url: url,
      refresh_url: url,
      type: 'account_onboarding',
      collection_options: {
        fields: 'currently_due',
      },
    })
  }

  async createDashboardLoginLink(accountId: string) {
    return await this.stripe.accounts.createLoginLink(accountId)
  }
}
