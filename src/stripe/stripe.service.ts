import Stripe from 'stripe'
import { Inject, Injectable } from '@nestjs/common'

import type {
  LinkMerchantAccountData,
  CreatePaymentIntentData,
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
  ) {
    this.stripe = new Stripe(this.apiKey, {
      apiVersion: '2025-12-15.clover',
    })
  }

  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
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

  async attachPaymentMethodToCustomer(
    paymentMethodId: string,
    customer: string,
  ) {
    return await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer,
    })
  }

  async detachPaymentMethod(paymentMethodId: string) {
    return await this.stripe.paymentMethods.detach(paymentMethodId)
  }

  async createPaymentIntent({
    amount,
    customer,
    savedCard,
  }: CreatePaymentIntentData) {
    return await this.stripe.paymentIntents.create({
      payment_method_types: ['card'],
      amount,
      currency: 'brl',
      customer,
      payment_method: savedCard,
      setup_future_usage: 'off_session',
    })
  }

  async confirmPaymentIntent(paymentIntentId: string, savedCard: string) {
    return await this.stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: savedCard,
    })
  }

  async refundPayment(paymentIntentId: string) {
    return await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
    })
  }

  async createTransfer(data: {
    amount: number
    destination: string
    metadata?: Record<string, string>
  }) {
    return await this.stripe.transfers.create({
      amount: data.amount,
      currency: 'brl',
      destination: data.destination,
      metadata: data.metadata,
    })
  }

  async reverseTransfer(transferId: string) {
    return await this.stripe.transfers.createReversal(transferId)
  }

  async listPayoutTransactions(payoutId: string, accountId: string) {
    return await this.stripe.balanceTransactions.list(
      { payout: payoutId, expand: ['data.source'] },
      { stripeAccount: accountId },
    )
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
