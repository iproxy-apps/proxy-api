import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { HandlePaymentFailedService } from './handle-payment-failed.service'

describe('HandlePaymentFailedService', () => {
  let service: HandlePaymentFailedService
  let findFirst: jest.Mock
  let transaction: jest.Mock
  let paymentsUpdateMany: jest.Mock
  let mappingDeleteMany: jest.Mock
  let tasksUpdate: jest.Mock

  beforeEach(() => {
    findFirst = jest.fn()
    transaction = jest.fn().mockResolvedValue(undefined)
    paymentsUpdateMany = jest.fn().mockReturnValue('payments-op')
    mappingDeleteMany = jest.fn().mockReturnValue('mapping-op')
    tasksUpdate = jest.fn().mockReturnValue('task-op')

    const prisma = {
      payments: { findFirst, updateMany: paymentsUpdateMany },
      userTaskMapping: { deleteMany: mappingDeleteMany },
      tasks: { update: tasksUpdate },
      $transaction: transaction,
    } as unknown as PrismaService

    service = new HandlePaymentFailedService(prisma)
  })

  it('is a no-op when no payment record exists for the intent', async () => {
    findFirst.mockResolvedValue(null)

    await service.execute({ id: 'pi_missing' } as Stripe.PaymentIntent)

    expect(transaction).not.toHaveBeenCalled()
  })

  it('marks payment as failed, removes the mapping and reverts the task to available', async () => {
    findFirst.mockResolvedValue({ taskId: 'task-1' })

    await service.execute({ id: 'pi_123' } as Stripe.PaymentIntent)

    expect(paymentsUpdateMany).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_123' },
      data: { status: 'failed' },
    })
    expect(mappingDeleteMany).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
    })
    expect(tasksUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'available', startedAt: null },
    })
    expect(transaction).toHaveBeenCalledWith([
      'payments-op',
      'mapping-op',
      'task-op',
    ])
  })
})
