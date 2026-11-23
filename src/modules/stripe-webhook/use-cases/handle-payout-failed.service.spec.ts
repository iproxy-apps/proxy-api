import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandlePayoutFailedService } from './handle-payout-failed.service'

describe('HandlePayoutFailedService', () => {
  let service: HandlePayoutFailedService
  let updateMany: jest.Mock
  let loggerError: jest.SpyInstance

  const payout = {
    id: 'po_1',
    failure_code: 'account_closed',
    failure_message: 'closed',
  } as Stripe.Payout

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 1 })
    service = new HandlePayoutFailedService({
      users: { updateMany },
    } as unknown as PrismaService)
    loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {})
  })

  it('flags the proxy payoutIssue and does nothing else', async () => {
    await service.execute(payout, 'acct_1')

    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_1' },
      data: { payoutIssue: true },
    })
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('account_closed'),
    )
  })

  it('warns when no user has that stripeAccountId', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 })
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => {})

    await service.execute(payout, 'acct_missing')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('acct_missing'))
  })

  it('only logs when the event has no account context', async () => {
    await service.execute(payout, undefined)

    expect(updateMany).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledTimes(1)
  })
})
