import Stripe from 'stripe'
import { Logger } from '@nestjs/common'

import { StripeService } from 'src/stripe/stripe.service'
import { errorDictionary } from 'src/exception/error-dictionary'

import { HandlePayoutFailedService } from './handle-payout-failed.service'
import { HandlePaymentFailedService } from './handle-payment-failed.service'
import { DispatchStripeEventService } from './dispatch-stripe-event.service'
import { HandleAccountUpdatedService } from './handle-account-updated.service'
import { HandleChargeDisputedService } from './handle-charge-disputed.service'
import { HandleChargeRefundedService } from './handle-charge-refunded.service'
import { StripeEventsRepository } from '../repository/stripe-events.repository'
import { HandlePaymentSucceededService } from './handle-payment-succeeded.service'

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'constructWebhookEvent'>
>
type StripeEventsRepositoryMock = jest.Mocked<
  Pick<StripeEventsRepository, 'tryMarkProcessed' | 'remove'>
>
type HandlerMock<T extends { execute: (...args: never[]) => unknown }> =
  jest.Mocked<Pick<T, 'execute'>>

const makeEvent = (
  type: Stripe.Event.Type,
  data: unknown,
  id = 'evt_1',
): Stripe.Event =>
  ({
    id,
    type,
    data: { object: data },
  }) as unknown as Stripe.Event

describe('DispatchStripeEventService', () => {
  let service: DispatchStripeEventService
  let stripeService: StripeServiceMock
  let eventsRepo: StripeEventsRepositoryMock
  let accountUpdated: HandlerMock<HandleAccountUpdatedService>
  let chargeDisputed: HandlerMock<HandleChargeDisputedService>
  let chargeRefunded: HandlerMock<HandleChargeRefundedService>
  let paymentFailed: HandlerMock<HandlePaymentFailedService>
  let payoutFailed: HandlerMock<HandlePayoutFailedService>
  let paymentSucceeded: HandlerMock<HandlePaymentSucceededService>

  beforeEach(() => {
    stripeService = { constructWebhookEvent: jest.fn() }
    eventsRepo = {
      tryMarkProcessed: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockResolvedValue(undefined),
    }
    accountUpdated = { execute: jest.fn() }
    chargeDisputed = { execute: jest.fn() }
    chargeRefunded = { execute: jest.fn() }
    paymentFailed = { execute: jest.fn() }
    payoutFailed = { execute: jest.fn() }
    paymentSucceeded = { execute: jest.fn() }

    service = new DispatchStripeEventService(
      stripeService as unknown as StripeService,
      eventsRepo as unknown as StripeEventsRepository,
      accountUpdated as unknown as HandleAccountUpdatedService,
      chargeDisputed as unknown as HandleChargeDisputedService,
      chargeRefunded as unknown as HandleChargeRefundedService,
      paymentFailed as unknown as HandlePaymentFailedService,
      payoutFailed as unknown as HandlePayoutFailedService,
      paymentSucceeded as unknown as HandlePaymentSucceededService,
    )
  })

  it('throws invalidSignature when signature verification fails', async () => {
    stripeService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })

    await expect(
      service.execute(Buffer.from('{}'), 'bad-sig'),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.webhook.invalidSignature.errorCode,
    })

    expect(eventsRepo.tryMarkProcessed).not.toHaveBeenCalled()
  })

  it('skips processing when the event was already handled', async () => {
    stripeService.constructWebhookEvent.mockReturnValue(
      makeEvent('payment_intent.succeeded', { id: 'pi_1' }),
    )
    eventsRepo.tryMarkProcessed.mockResolvedValue(false)

    await service.execute(Buffer.from('{}'), 'sig')

    expect(paymentSucceeded.execute).not.toHaveBeenCalled()
    expect(eventsRepo.remove).not.toHaveBeenCalled()
  })

  it('removes the dedupe claim and rethrows when a handler fails', async () => {
    stripeService.constructWebhookEvent.mockReturnValue(
      makeEvent('payment_intent.succeeded', { id: 'pi_1' }),
    )
    const failure = new Error('db down')
    paymentSucceeded.execute.mockRejectedValue(failure)

    await expect(service.execute(Buffer.from('{}'), 'sig')).rejects.toBe(
      failure,
    )

    expect(eventsRepo.remove).toHaveBeenCalledWith('evt_1')
  })

  it('still rethrows the original handler error when remove fails', async () => {
    stripeService.constructWebhookEvent.mockReturnValue(
      makeEvent('payment_intent.succeeded', { id: 'pi_1' }),
    )
    const failure = new Error('db down')
    paymentSucceeded.execute.mockRejectedValue(failure)
    eventsRepo.remove.mockRejectedValue(new Error('remove failed'))
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)

    await expect(service.execute(Buffer.from('{}'), 'sig')).rejects.toBe(
      failure,
    )

    expect(logSpy).toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it.each([
    ['payment_intent.succeeded', () => paymentSucceeded],
    ['payment_intent.payment_failed', () => paymentFailed],
    ['charge.refunded', () => chargeRefunded],
    ['charge.dispute.created', () => chargeDisputed],
    ['account.updated', () => accountUpdated],
  ] as const)('routes %s to the correct handler', async (type, pickHandler) => {
    const eventData = { id: 'obj_1' }
    stripeService.constructWebhookEvent.mockReturnValue(
      makeEvent(type as Stripe.Event.Type, eventData),
    )

    await service.execute(Buffer.from('{}'), 'sig')

    expect(pickHandler().execute).toHaveBeenCalledWith(eventData)
    expect(eventsRepo.tryMarkProcessed).toHaveBeenCalledWith('evt_1', type)
    expect(eventsRepo.remove).not.toHaveBeenCalled()
  })

  it('routes payout.failed with the connected account id', async () => {
    const eventData = { id: 'po_1' }
    stripeService.constructWebhookEvent.mockReturnValue({
      id: 'evt_payout',
      type: 'payout.failed',
      account: 'acct_connected',
      data: { object: eventData },
    } as unknown as Stripe.Event)

    await service.execute(Buffer.from('{}'), 'sig')

    expect(payoutFailed.execute).toHaveBeenCalledWith(
      eventData,
      'acct_connected',
    )
  })

  it('records unhandled event types without calling any handler', async () => {
    stripeService.constructWebhookEvent.mockReturnValue(
      makeEvent('customer.created' as Stripe.Event.Type, { id: 'cus_1' }),
    )

    await service.execute(Buffer.from('{}'), 'sig')

    expect(paymentSucceeded.execute).not.toHaveBeenCalled()
    expect(paymentFailed.execute).not.toHaveBeenCalled()
    expect(chargeRefunded.execute).not.toHaveBeenCalled()
    expect(chargeDisputed.execute).not.toHaveBeenCalled()
    expect(accountUpdated.execute).not.toHaveBeenCalled()
    expect(eventsRepo.tryMarkProcessed).toHaveBeenCalled()
  })
})
