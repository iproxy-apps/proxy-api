import { Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { CancelTaskService } from './cancel-task.service'
import { StripeService } from 'src/stripe/stripe.service'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

type TasksRepositoryMock = jest.Mocked<
  Pick<TasksRepository, 'fetchTaskById' | 'transition'>
>

type StripeServiceMock = jest.Mocked<Pick<StripeService, 'refundPaymentIntent'>>

type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchLatestByTaskId' | 'updateById'>
>

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000)

const makePayment = (status: string) =>
  ({
    id: 'pay-1',
    amount: 50,
    status,
    refundId: null,
    taskId: 'task-1',
    paymentIntent: 'pi_123',
  }) as unknown as Awaited<
    ReturnType<PaymentsRepository['fetchLatestByTaskId']>
  >

const refundResult = (id: string, status: string) =>
  ({ id, status }) as Awaited<ReturnType<StripeService['refundPaymentIntent']>>

describe('CancelTaskService', () => {
  let service: CancelTaskService
  let stripeService: StripeServiceMock
  let tasksRepository: TasksRepositoryMock
  let paymentsRepository: PaymentsRepositoryMock
  let loggerError: jest.SpyInstance
  let loggerWarn: jest.SpyInstance

  const run = () => service.execute({ taskId: 'task-1', userId: 'client-1' })

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
    stripeService = { refundPaymentIntent: jest.fn() }
    tasksRepository = {
      fetchTaskById: jest.fn(),
      transition: jest.fn().mockResolvedValue(true),
    }
    paymentsRepository = {
      fetchLatestByTaskId: jest.fn().mockResolvedValue(null),
      updateById: jest.fn().mockResolvedValue(undefined),
    }

    service = new CancelTaskService(
      stripeService as unknown as StripeService,
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws cannotCancelTask when requester is not the task owner', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({
        owner: 'someone-else',
        status: 'in_progress',
        startedAt: hoursAgo(0),
      }),
    )

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotCancelTask.errorCode,
    })

    expect(paymentsRepository.fetchLatestByTaskId).not.toHaveBeenCalled()
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws cannotCancelTask when the task status is terminal', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'completed' }),
    )

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotCancelTask.errorCode,
    })

    expect(paymentsRepository.fetchLatestByTaskId).not.toHaveBeenCalled()
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws cannotCancelTask when in_progress task started more than 1 hour ago', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(2) }),
    )

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotCancelTask.errorCode,
    })

    expect(paymentsRepository.fetchLatestByTaskId).not.toHaveBeenCalled()
    expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws PAYMENT_DISPUTED before transition when the latest payment is disputed', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('disputed'),
    )

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.disputed.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
    expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
  })

  it('throws statusConflict when the CAS to canceled loses the race', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('succeeded'),
    )
    tasksRepository.transition.mockResolvedValue(false)

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.statusConflict.errorCode,
    })

    expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
  })

  it('cancels an available task without a Stripe call (no payment yet)', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'available', startedAt: null }),
    )

    await run()

    expect(tasksRepository.transition).toHaveBeenCalledWith({
      taskId: 'task-1',
      from: ['available'],
      to: 'canceled',
      data: { canceledAt: expect.any(Date) },
    })
    expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
    expect(paymentsRepository.updateById).not.toHaveBeenCalled()
  })

  it('cancels an in_progress task without a Stripe call when there is no payment row', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )

    await run()

    expect(tasksRepository.transition).toHaveBeenCalledWith({
      taskId: 'task-1',
      from: ['in_progress'],
      to: 'canceled',
      data: { canceledAt: expect.any(Date) },
    })
    expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
  })

  it.each([['failed'], ['refunded']])(
    'cancels without a Stripe call when the latest payment is %s',
    async (status) => {
      tasksRepository.fetchTaskById.mockResolvedValue(
        makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
      )
      paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
        makePayment(status),
      )

      await run()

      expect(tasksRepository.transition).toHaveBeenCalledTimes(1)
      expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
      expect(paymentsRepository.updateById).not.toHaveBeenCalled()
    },
  )

  it('cancels a legacy pending payment without a Stripe call and warns', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('pending'),
    )

    await run()

    expect(stripeService.refundPaymentIntent).not.toHaveBeenCalled()
    expect(paymentsRepository.updateById).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      'legacy pending payment pay-1 on canceled task task-1',
    )
  })

  it.each([['succeeded'], ['pending']])(
    'cancels first, then refunds a succeeded charge with the shared key (refund %s)',
    async (refundStatus) => {
      tasksRepository.fetchTaskById.mockResolvedValue(
        makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
      )
      paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
        makePayment('succeeded'),
      )
      stripeService.refundPaymentIntent.mockResolvedValue(
        refundResult('re_123', refundStatus),
      )

      await run()

      expect(stripeService.refundPaymentIntent).toHaveBeenCalledWith(
        'pi_123',
        'task:task-1:refund',
      )
      expect(
        tasksRepository.transition.mock.invocationCallOrder[0],
      ).toBeLessThan(
        stripeService.refundPaymentIntent.mock.invocationCallOrder[0],
      )
      expect(tasksRepository.transition).toHaveBeenCalledTimes(1)
      expect(paymentsRepository.updateById).toHaveBeenCalledWith('pay-1', {
        status: 'refunded',
        refundId: 're_123',
      })
    },
  )

  it('reverts the task and throws refundFailed when Stripe throws', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('succeeded'),
    )
    stripeService.refundPaymentIntent.mockRejectedValue(
      new Error('stripe down'),
    )

    const error = await run().catch((e: unknown) => e)
    expect(error).toMatchObject({
      errorCode: errorDictionary.payment.refundFailed.errorCode,
    })
    expect((error as AppException).getStatus()).toBe(500)

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('stripe down'),
    )
    expect(tasksRepository.transition).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      from: ['canceled'],
      to: 'in_progress',
      data: { canceledAt: null },
    })
    expect(paymentsRepository.updateById).not.toHaveBeenCalled()
  })

  it('reverts and throws refundFailed when Stripe reports a failed refund', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('succeeded'),
    )
    stripeService.refundPaymentIntent.mockResolvedValue(
      refundResult('re_123', 'failed'),
    )

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.refundFailed.errorCode,
    })

    expect(tasksRepository.transition).toHaveBeenCalledTimes(2)
    expect(paymentsRepository.updateById).not.toHaveBeenCalled()
  })

  it('still throws refundFailed when the revert itself throws', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('succeeded'),
    )
    stripeService.refundPaymentIntent.mockRejectedValue(
      new Error('stripe down'),
    )
    tasksRepository.transition
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('db down'))

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.refundFailed.errorCode,
    })

    expect(tasksRepository.transition).toHaveBeenCalledTimes(2)
    expect(loggerError).toHaveBeenCalledTimes(2)
    expect(loggerError).toHaveBeenLastCalledWith(
      expect.stringContaining('db down'),
    )
  })

  it('keeps the task canceled when the refund is accepted but updateById fails', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('succeeded'),
    )
    stripeService.refundPaymentIntent.mockResolvedValue(
      refundResult('re_123', 'succeeded'),
    )
    paymentsRepository.updateById.mockRejectedValue(new Error('db down'))

    await expect(run()).rejects.toThrow('db down')

    expect(tasksRepository.transition).toHaveBeenCalledTimes(1)
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('refunded by re_123 but payment pay-1'),
    )
  })

  it('logs when the revert matches no row', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment('succeeded'),
    )
    stripeService.refundPaymentIntent.mockRejectedValue(
      new Error('stripe down'),
    )
    tasksRepository.transition
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(run()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.refundFailed.errorCode,
    })

    expect(loggerError).toHaveBeenCalledWith(
      'revert of task task-1 matched no row',
    )
  })
})
