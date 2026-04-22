import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandleChargeRefundedService } from './handle-charge-refunded.service'

describe('HandleChargeRefundedService', () => {
  let service: HandleChargeRefundedService
  let updateMany: jest.Mock

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const prisma = {
      payments: { updateMany },
    } as unknown as PrismaService

    service = new HandleChargeRefundedService(prisma)
  })

  it('is a no-op when the charge has no payment_intent', async () => {
    await service.execute({ payment_intent: null } as unknown as Stripe.Charge)

    expect(updateMany).not.toHaveBeenCalled()
  })

  it('marks the payment as refunded and stores the refund id (string payment_intent)', async () => {
    await service.execute({
      payment_intent: 'pi_123',
      refunds: { data: [{ id: 're_abc' }] },
    } as unknown as Stripe.Charge)

    expect(updateMany).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_123' },
      data: { status: 'refunded', refundId: 're_abc' },
    })
  })

  it('accepts an expanded payment_intent object', async () => {
    await service.execute({
      payment_intent: { id: 'pi_456' },
      refunds: { data: [{ id: 're_xyz' }] },
    } as unknown as Stripe.Charge)

    expect(updateMany).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_456' },
      data: { status: 'refunded', refundId: 're_xyz' },
    })
  })

  it('handles charges without refunds present', async () => {
    await service.execute({
      payment_intent: 'pi_789',
    } as unknown as Stripe.Charge)

    expect(updateMany).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_789' },
      data: { status: 'refunded', refundId: null },
    })
  })
})
