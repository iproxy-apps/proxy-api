import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandleChargeRefundedService } from './handle-charge-refunded.service'

describe('HandleChargeRefundedService', () => {
  let service: HandleChargeRefundedService
  let updateMany: jest.Mock

  const charge = (extra: Record<string, unknown>) =>
    ({
      amount: 5000,
      amount_refunded: 5000,
      ...extra,
    }) as unknown as Stripe.Charge

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 1 })
    service = new HandleChargeRefundedService({
      payments: { updateMany },
    } as unknown as PrismaService)
  })

  it('is a no-op when the charge has no payment_intent', async () => {
    await service.execute(charge({ payment_intent: null }))

    expect(updateMany).not.toHaveBeenCalled()
  })

  it('marks the payment refunded and stores the refund id on a full refund', async () => {
    await service.execute(
      charge({
        payment_intent: 'pi_123',
        refunds: { data: [{ id: 're_abc' }] },
      }),
    )

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        paymentIntent: 'pi_123',
        status: { in: ['succeeded', 'pending'] },
      },
      data: { status: 'refunded', refundId: 're_abc' },
    })
  })

  it('accepts an expanded payment_intent object', async () => {
    await service.execute(
      charge({
        payment_intent: { id: 'pi_456' },
        refunds: { data: [{ id: 're_xyz' }] },
      }),
    )

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        paymentIntent: 'pi_456',
        status: { in: ['succeeded', 'pending'] },
      },
      data: { status: 'refunded', refundId: 're_xyz' },
    })
  })

  it('does not overwrite the stored refund id when none is listed', async () => {
    await service.execute(charge({ payment_intent: 'pi_789' }))

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        paymentIntent: 'pi_789',
        status: { in: ['succeeded', 'pending'] },
      },
      data: { status: 'refunded' },
    })
  })

  it('warns instead of refunding when the payment is not succeeded or pending', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 })
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => {})

    await service.execute(charge({ payment_intent: 'pi_disp' }))

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        paymentIntent: 'pi_disp',
        status: { in: ['succeeded', 'pending'] },
      },
      data: { status: 'refunded' },
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pi_disp'))
  })

  it('leaves the status alone on a partial refund', async () => {
    await service.execute(
      charge({
        payment_intent: 'pi_part',
        amount_refunded: 2500,
        refunds: { data: [{ id: 're_part' }] },
      }),
    )

    expect(updateMany).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_part' },
      data: { refundId: 're_part' },
    })
  })

  it('does nothing on a partial refund without a refund id', async () => {
    await service.execute(
      charge({ payment_intent: 'pi_part', amount_refunded: 2500 }),
    )

    expect(updateMany).not.toHaveBeenCalled()
  })
})
