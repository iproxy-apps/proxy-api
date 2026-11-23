import Stripe from 'stripe'

import { PrismaService } from 'src/prisma/prisma.service'
import { StripeService } from 'src/stripe/stripe.service'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { HandlePaymentSucceededService } from './handle-payment-succeeded.service'

describe('HandlePaymentSucceededService', () => {
  let service: HandlePaymentSucceededService
  let findUnique: jest.Mock
  let findByPaymentIntent: jest.Mock
  let recordSucceededCharge: jest.Mock
  let updateById: jest.Mock
  let refundPaymentIntent: jest.Mock

  const intent = (extra: Record<string, unknown> = {}) =>
    ({
      id: 'pi_1',
      amount: 10000,
      latest_charge: 'ch_1',
      metadata: { taskId: 'task-1' },
      ...extra,
    }) as unknown as Stripe.PaymentIntent

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue({ status: 'in_progress' })
    findByPaymentIntent = jest.fn().mockResolvedValue(null)
    recordSucceededCharge = jest
      .fn()
      .mockResolvedValue({ id: 'pay-1', taskId: 'task-1', status: 'succeeded' })
    updateById = jest.fn().mockResolvedValue(undefined)
    refundPaymentIntent = jest
      .fn()
      .mockResolvedValue({ id: 're_1', status: 'succeeded' })

    service = new HandlePaymentSucceededService(
      { tasks: { findUnique } } as unknown as PrismaService,
      {
        findByPaymentIntent,
        recordSucceededCharge,
        updateById,
      } as unknown as PaymentsRepository,
      { refundPaymentIntent } as unknown as StripeService,
    )
  })

  it('writes the succeeded row from the metadata task id', async () => {
    await service.execute(intent())

    expect(recordSucceededCharge).toHaveBeenCalledTimes(1)
    const arg = recordSucceededCharge.mock.calls[0][0]
    expect(arg.taskId).toBe('task-1')
    expect(arg.paymentIntent).toBe('pi_1')
    expect(arg.chargeId).toBe('ch_1')
    expect(arg.amount.toString()).toBe('100')
    expect(refundPaymentIntent).not.toHaveBeenCalled()
  })

  it('prefers the task id of the existing row and accepts an expanded charge', async () => {
    findByPaymentIntent.mockResolvedValue({
      taskId: 'task-1',
      status: 'pending',
    })

    await service.execute(
      intent({ metadata: {}, latest_charge: { id: 'ch_obj' } }),
    )

    expect(recordSucceededCharge.mock.calls[0][0]).toMatchObject({
      taskId: 'task-1',
      chargeId: 'ch_obj',
    })
  })

  it('does nothing when the intent matches no task', async () => {
    await service.execute(intent({ metadata: {} }))

    expect(recordSucceededCharge).not.toHaveBeenCalled()
  })

  it('leaves a terminal payment row untouched', async () => {
    findByPaymentIntent.mockResolvedValue({
      taskId: 'task-1',
      status: 'failed',
    })

    await service.execute(intent())

    expect(recordSucceededCharge).not.toHaveBeenCalled()
    expect(refundPaymentIntent).not.toHaveBeenCalled()
  })

  it('refunds with the shared key when the task is canceled', async () => {
    findUnique.mockResolvedValue({ status: 'canceled' })

    await service.execute(intent())

    expect(refundPaymentIntent).toHaveBeenCalledWith(
      'pi_1',
      'task:task-1:refund',
    )
    expect(updateById).toHaveBeenCalledWith('pay-1', {
      status: 'refunded',
      refundId: 're_1',
    })
  })

  it('throws and does not mark refunded when the refund status is failed', async () => {
    findUnique.mockResolvedValue({ status: 'canceled' })
    refundPaymentIntent.mockResolvedValue({ id: 're_1', status: 'failed' })

    await expect(service.execute(intent())).rejects.toThrow()

    expect(updateById).not.toHaveBeenCalled()
  })

  it('does not refund a canceled task whose payment is no longer succeeded', async () => {
    findUnique.mockResolvedValue({ status: 'canceled' })
    recordSucceededCharge.mockResolvedValue({
      id: 'pay-1',
      taskId: 'task-1',
      status: 'refunded',
    })

    await service.execute(intent())

    expect(refundPaymentIntent).not.toHaveBeenCalled()
    expect(updateById).not.toHaveBeenCalled()
  })
})
