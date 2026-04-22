import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandleAccountUpdatedService } from './handle-account-updated.service'

describe('HandleAccountUpdatedService', () => {
  let service: HandleAccountUpdatedService
  let updateMany: jest.Mock

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const prisma = {
      users: { updateMany },
    } as unknown as PrismaService

    service = new HandleAccountUpdatedService(prisma)
  })

  it('marks the user as ready when both charges and payouts are enabled', async () => {
    await service.execute({
      id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
    } as Stripe.Account)

    expect(updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_123' },
      data: { stripeAccountReady: true },
    })
  })

  it('marks the user as not ready when either flag is disabled', async () => {
    await service.execute({
      id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: false,
    } as Stripe.Account)

    expect(updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_123' },
      data: { stripeAccountReady: false },
    })
  })
})
