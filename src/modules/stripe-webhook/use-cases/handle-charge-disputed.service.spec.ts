import Stripe from 'stripe'
import { Prisma } from '@prisma/client'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandleChargeDisputedService } from './handle-charge-disputed.service'

describe('HandleChargeDisputedService', () => {
  let service: HandleChargeDisputedService
  let paymentsFindFirst: jest.Mock
  let paymentsUpdate: jest.Mock
  let mappingFindUnique: jest.Mock
  let usersUpdate: jest.Mock
  let transaction: jest.Mock

  beforeEach(() => {
    paymentsFindFirst = jest.fn()
    paymentsUpdate = jest.fn().mockReturnValue('payments-update-op')
    mappingFindUnique = jest.fn()
    usersUpdate = jest.fn().mockReturnValue('users-update-op')
    transaction = jest.fn().mockResolvedValue(undefined)

    const prisma = {
      payments: { findFirst: paymentsFindFirst, update: paymentsUpdate },
      userTaskMapping: { findUnique: mappingFindUnique },
      users: { update: usersUpdate },
      $transaction: transaction,
    } as unknown as PrismaService

    service = new HandleChargeDisputedService(prisma)

    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {})
  })

  it('is a no-op when the dispute has no payment_intent', async () => {
    await service.execute({
      id: 'dp_1',
      payment_intent: null,
    } as unknown as Stripe.Dispute)

    expect(paymentsFindFirst).not.toHaveBeenCalled()
  })

  it('is a no-op when no payment record exists', async () => {
    paymentsFindFirst.mockResolvedValue(null)

    await service.execute({
      id: 'dp_1',
      payment_intent: 'pi_123',
    } as unknown as Stripe.Dispute)

    expect(paymentsUpdate).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('marks payment as disputed without reversing wallet when task is not completed', async () => {
    paymentsFindFirst.mockResolvedValue({
      id: 'pay-1',
      taskId: 'task-1',
      task: { status: 'in_progress', proxyEarnings: null },
    })
    mappingFindUnique.mockResolvedValue(null)

    await service.execute({
      id: 'dp_1',
      payment_intent: 'pi_123',
    } as unknown as Stripe.Dispute)

    expect(paymentsUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'disputed' },
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('marks payment as disputed without reversing when there is no executor mapping', async () => {
    paymentsFindFirst.mockResolvedValue({
      id: 'pay-1',
      taskId: 'task-1',
      task: { status: 'completed', proxyEarnings: new Prisma.Decimal(20) },
    })
    mappingFindUnique.mockResolvedValue(null)

    await service.execute({
      id: 'dp_1',
      payment_intent: 'pi_123',
    } as unknown as Stripe.Dispute)

    expect(paymentsUpdate).toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('reverses the executor wallet within a transaction when task is completed', async () => {
    const proxyEarnings = new Prisma.Decimal(20)
    paymentsFindFirst.mockResolvedValue({
      id: 'pay-1',
      taskId: 'task-1',
      task: { status: 'completed', proxyEarnings },
    })
    mappingFindUnique.mockResolvedValue({ executorId: 'proxy-1' })

    await service.execute({
      id: 'dp_1',
      payment_intent: 'pi_123',
    } as unknown as Stripe.Dispute)

    expect(paymentsUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'disputed' },
    })
    expect(usersUpdate).toHaveBeenCalledWith({
      where: { id: 'proxy-1' },
      data: { walletBalance: { decrement: proxyEarnings } },
    })
    expect(transaction).toHaveBeenCalledWith([
      'payments-update-op',
      'users-update-op',
    ])
  })
})
