import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandlePaymentSucceededService } from './handle-payment-succeeded.service'

describe('HandlePaymentSucceededService', () => {
  let service: HandlePaymentSucceededService
  let updateMany: jest.Mock

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const prisma = {
      payments: { updateMany },
    } as unknown as PrismaService

    service = new HandlePaymentSucceededService(prisma)
  })

  it('marks pending payments for the given intent as succeeded', async () => {
    const intent = { id: 'pi_123' } as Stripe.PaymentIntent

    await service.execute(intent)

    expect(updateMany).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_123', status: 'pending' },
      data: { status: 'succeeded' },
    })
  })
})
