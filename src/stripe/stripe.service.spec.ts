import { StripeService } from './stripe.service'

describe('StripeService', () => {
  const constructEvent = jest.fn()
  const create = jest.fn()
  const setupIntentsCreate = jest.fn()
  const refundsCreate = jest.fn()
  const transfersCreate = jest.fn()

  const stubSdk = (svc: StripeService) => {
    ;(svc as any).stripe = {
      webhooks: { constructEvent },
      paymentIntents: { create },
      setupIntents: { create: setupIntentsCreate },
      refunds: { create: refundsCreate },
      transfers: { create: transfersCreate },
    }
    return svc
  }

  let service: StripeService

  beforeEach(() => {
    jest.resetAllMocks()
    service = stubSdk(
      new StripeService('sk_test_x', 'whsec_platform', 'whsec_connect'),
    )
  })

  it('verifies with the platform secret first', () => {
    constructEvent.mockReturnValueOnce({ id: 'evt_1' })
    expect(service.constructWebhookEvent('{}', 'sig')).toEqual({ id: 'evt_1' })
    expect(constructEvent).toHaveBeenCalledTimes(1)
    expect(constructEvent).toHaveBeenCalledWith('{}', 'sig', 'whsec_platform')
  })

  it('falls back to the Connect secret when the platform secret rejects', () => {
    constructEvent
      .mockImplementationOnce(() => {
        throw new Error('No signatures found')
      })
      .mockReturnValueOnce({ id: 'evt_2' })
    expect(service.constructWebhookEvent('{}', 'sig')).toEqual({ id: 'evt_2' })
    expect(constructEvent).toHaveBeenNthCalledWith(
      2,
      '{}',
      'sig',
      'whsec_connect',
    )
  })

  it('rethrows the first error when no Connect secret is configured', () => {
    const svc = stubSdk(new StripeService('sk_test_x', 'whsec_platform', null))
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig')
    })
    expect(() => svc.constructWebhookEvent('{}', 'sig')).toThrow('bad sig')
    expect(constructEvent).toHaveBeenCalledTimes(1)
  })

  it('creates and confirms an off-session PaymentIntent with automatic capture and the idempotency key', async () => {
    await service.chargeSavedCard(
      {
        amount: 10000,
        customer: 'cus_1',
        paymentMethod: 'pm_1',
        taskId: 't1',
        proxyId: 'p1',
        claimedAt: '2026-11-23T12:00:00.000Z',
      },
      'start:t1:p1:1795435200000',
    )
    expect(create).toHaveBeenCalledWith(
      {
        amount: 10000,
        currency: 'brl',
        customer: 'cus_1',
        payment_method: 'pm_1',
        payment_method_types: ['card'],
        confirm: true,
        off_session: true,
        transfer_group: 't1',
        metadata: {
          taskId: 't1',
          proxyId: 'p1',
          claimedAt: '2026-11-23T12:00:00.000Z',
        },
      },
      { idempotencyKey: 'start:t1:p1:1795435200000' },
    )
    // D3: automatic capture only
    expect(create.mock.calls[0][0]).not.toHaveProperty('capture_method')
  })

  it('creates a SetupIntent for off-session usage', async () => {
    await service.createSetupIntent('cus_1')
    expect(setupIntentsCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      usage: 'off_session',
      payment_method_types: ['card'],
    })
  })

  it('creates transfers from the charge with group and idempotency key', async () => {
    await service.createTransferFromCharge(
      {
        amount: 8000,
        destination: 'acct_1',
        sourceTransaction: 'ch_1',
        transferGroup: 't1',
        taskId: 't1',
      },
      'task:t1:transfer',
    )
    expect(transfersCreate).toHaveBeenCalledWith(
      {
        amount: 8000,
        currency: 'brl',
        destination: 'acct_1',
        source_transaction: 'ch_1',
        transfer_group: 't1',
        metadata: { taskId: 't1' },
      },
      { idempotencyKey: 'task:t1:transfer' },
    )
  })

  it('refunds by PaymentIntent with the idempotency key and no amount (full refund)', async () => {
    await service.refundPaymentIntent('pi_1', 'task:t1:refund')
    expect(refundsCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_1' },
      { idempotencyKey: 'task:t1:refund' },
    )
  })
})
