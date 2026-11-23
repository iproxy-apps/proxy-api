import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { HandlePaymentFailedService } from './handle-payment-failed.service'

describe('HandlePaymentFailedService', () => {
  let service: HandlePaymentFailedService
  let findFirst: jest.Mock
  let transaction: jest.Mock
  let paymentsUpdateMany: jest.Mock
  let tasksUpdateMany: jest.Mock
  let mappingDeleteMany: jest.Mock
  let findByPaymentIntent: jest.Mock
  let releaseClaim: jest.Mock

  const claimedAt = '2026-11-23T10:00:00.000Z'
  const metadata = { taskId: 'task-1', proxyId: 'proxy-1', claimedAt }

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue(null)
    paymentsUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
    tasksUpdateMany = jest.fn().mockResolvedValue({ count: 1 })
    mappingDeleteMany = jest.fn().mockResolvedValue({ count: 1 })
    const tx = {
      payments: { updateMany: paymentsUpdateMany },
      tasks: { updateMany: tasksUpdateMany },
      userTaskMapping: { deleteMany: mappingDeleteMany },
    }
    transaction = jest
      .fn()
      .mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
    findByPaymentIntent = jest.fn().mockResolvedValue(null)
    releaseClaim = jest.fn().mockResolvedValue(true)

    service = new HandlePaymentFailedService(
      {
        payments: { findFirst },
        $transaction: transaction,
      } as unknown as PrismaService,
      { releaseClaim } as unknown as TasksRepository,
      { findByPaymentIntent } as unknown as PaymentsRepository,
    )
  })

  it('fails a legacy pending payment and reverts the in_progress task', async () => {
    findFirst.mockResolvedValue({ id: 'pay-1', taskId: 'task-1' })

    await service.execute({ id: 'pi_1' } as Stripe.PaymentIntent)

    expect(findFirst).toHaveBeenCalledWith({
      where: { paymentIntent: 'pi_1', status: 'pending' },
      select: { id: true, taskId: true },
    })
    expect(paymentsUpdateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: 'pending' },
      data: { status: 'failed' },
    })
    expect(tasksUpdateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', status: 'in_progress' },
      data: { status: 'available', startedAt: null },
    })
    expect(mappingDeleteMany).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
    })
    expect(releaseClaim).not.toHaveBeenCalled()
  })

  it('keeps the mapping when the legacy task is not in_progress', async () => {
    findFirst.mockResolvedValue({ id: 'pay-1', taskId: 'task-1' })
    tasksUpdateMany.mockResolvedValue({ count: 0 })

    await service.execute({ id: 'pi_1' } as Stripe.PaymentIntent)

    expect(paymentsUpdateMany).toHaveBeenCalled()
    expect(mappingDeleteMany).not.toHaveBeenCalled()
  })

  it('leaves the task alone when the legacy payment stopped being pending', async () => {
    findFirst.mockResolvedValue({ id: 'pay-1', taskId: 'task-1' })
    paymentsUpdateMany.mockResolvedValue({ count: 0 })

    await service.execute({ id: 'pi_1' } as Stripe.PaymentIntent)

    expect(tasksUpdateMany).not.toHaveBeenCalled()
    expect(mappingDeleteMany).not.toHaveBeenCalled()
  })

  it('never downgrades an existing non-pending payment row', async () => {
    findByPaymentIntent.mockResolvedValue({ id: 'pay-1', status: 'succeeded' })

    await service.execute({
      id: 'pi_1',
      metadata,
    } as unknown as Stripe.PaymentIntent)

    expect(transaction).not.toHaveBeenCalled()
    expect(releaseClaim).not.toHaveBeenCalled()
  })

  it('releases the exact claim named by metadata when no row exists', async () => {
    await service.execute({
      id: 'pi_1',
      metadata,
    } as unknown as Stripe.PaymentIntent)

    expect(releaseClaim).toHaveBeenCalledWith({
      taskId: 'task-1',
      executorId: 'proxy-1',
      startedAt: new Date(claimedAt),
    })
  })

  it.each([
    [{}],
    [{ taskId: 'task-1', proxyId: 'proxy-1' }],
    [{ ...metadata, claimedAt: 'not-a-date' }],
  ])('does nothing with incomplete or invalid metadata %j', async (meta) => {
    await service.execute({
      id: 'pi_1',
      metadata: meta,
    } as unknown as Stripe.PaymentIntent)

    expect(releaseClaim).not.toHaveBeenCalled()
  })
})
