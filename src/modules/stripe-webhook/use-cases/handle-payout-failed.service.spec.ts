import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandlePayoutFailedService } from './handle-payout-failed.service'

describe('HandlePayoutFailedService', () => {
  let service: HandlePayoutFailedService
  let findFirst: jest.Mock
  let loggerSpy: jest.SpyInstance

  beforeEach(() => {
    findFirst = jest.fn()
    const prisma = {
      users: { findFirst },
    } as unknown as PrismaService

    service = new HandlePayoutFailedService(prisma)
    loggerSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    loggerSpy.mockRestore()
  })

  it('logs with the resolved user when an accountId is provided', async () => {
    findFirst.mockResolvedValue({ id: 'user-1', email: 'proxy@test.io' })

    await service.execute(
      {
        id: 'po_123',
        failure_code: 'account_closed',
        failure_message: 'Bank account is closed',
      } as Stripe.Payout,
      'acct_abc',
    )

    expect(findFirst).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_abc' },
      select: { id: true, email: true },
    })
    expect(loggerSpy).toHaveBeenCalledTimes(1)
    expect(loggerSpy.mock.calls[0][0]).toContain('po_123')
    expect(loggerSpy.mock.calls[0][0]).toContain('user-1')
    expect(loggerSpy.mock.calls[0][0]).toContain('account_closed')
  })

  it('still logs when no user is resolved', async () => {
    findFirst.mockResolvedValue(null)

    await service.execute(
      {
        id: 'po_456',
        failure_code: null,
        failure_message: null,
      } as unknown as Stripe.Payout,
      'acct_unknown',
    )

    expect(loggerSpy).toHaveBeenCalledTimes(1)
    expect(loggerSpy.mock.calls[0][0]).toContain('po_456')
    expect(loggerSpy.mock.calls[0][0]).toContain('unknown')
  })

  it('skips the user lookup when no accountId is available', async () => {
    await service.execute({ id: 'po_789' } as Stripe.Payout)

    expect(findFirst).not.toHaveBeenCalled()
    expect(loggerSpy).toHaveBeenCalledTimes(1)
  })
})
