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

  it('marks the user ready and clears payoutIssue when charges and payouts are enabled', async () => {
    await service.execute({
      id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
    } as Stripe.Account)

    expect(updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_123' },
      data: { stripeAccountReady: true, payoutIssue: false },
    })
  })

  it('marks the user not ready and keeps payoutIssue when payouts are disabled', async () => {
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

  it('does not update anything when the account id is missing', async () => {
    await service.execute({
      charges_enabled: true,
      payouts_enabled: true,
    } as Stripe.Account)

    expect(updateMany).not.toHaveBeenCalled()
  })
})
