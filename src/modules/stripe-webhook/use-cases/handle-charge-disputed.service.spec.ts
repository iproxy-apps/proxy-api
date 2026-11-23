import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandleChargeDisputedService } from './handle-charge-disputed.service'

describe('HandleChargeDisputedService', () => {
  let service: HandleChargeDisputedService
  let paymentsFindFirst: jest.Mock
  let paymentsUpdate: jest.Mock
  let warn: jest.SpyInstance

  const dispute = (extra: Record<string, unknown> = {}) =>
    ({
      id: 'dp_1',
      payment_intent: 'pi_123',
      ...extra,
    }) as unknown as Stripe.Dispute

  beforeEach(() => {
    paymentsFindFirst = jest.fn()
    paymentsUpdate = jest.fn().mockResolvedValue({ count: 1 })

    service = new HandleChargeDisputedService({
      payments: { findFirst: paymentsFindFirst, updateMany: paymentsUpdate },
    } as unknown as PrismaService)

    warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {})
  })

  it('is a no-op when the dispute has no payment_intent', async () => {
    await service.execute(dispute({ payment_intent: null }))

    expect(paymentsFindFirst).not.toHaveBeenCalled()
  })

  it('is a no-op when no payment record exists', async () => {
    paymentsFindFirst.mockResolvedValue(null)

    await service.execute(dispute())

    expect(paymentsUpdate).not.toHaveBeenCalled()
  })

  it('marks the payment disputed and stores the dispute id', async () => {
    paymentsFindFirst.mockResolvedValue({
      id: 'pay-1',
      taskId: 'task-1',
      task: { status: 'completed' },
    })

    await service.execute(dispute())

    expect(paymentsUpdate).toHaveBeenCalledTimes(1)
    expect(paymentsUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: { not: 'disputed' } },
      data: { status: 'disputed', disputeId: 'dp_1' },
    })
  })

  it('accepts an expanded payment_intent object', async () => {
    paymentsFindFirst.mockResolvedValue(null)

    await service.execute(dispute({ payment_intent: { id: 'pi_obj' } }))

    expect(paymentsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paymentIntent: 'pi_obj' } }),
    )
  })

  it('warns and does not write twice when the payment is already disputed', async () => {
    paymentsFindFirst.mockResolvedValue({
      id: 'pay-1',
      taskId: 'task-1',
      task: { status: 'completed' },
    })
    paymentsUpdate.mockResolvedValue({ count: 0 })

    await service.execute(dispute({ id: 'dp_2' }))

    expect(paymentsUpdate).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('already disputed'),
    )
  })
})
