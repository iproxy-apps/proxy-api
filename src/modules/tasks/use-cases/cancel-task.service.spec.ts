import { CancelTaskService } from './cancel-task.service'
import { StripeService } from 'src/stripe/stripe.service'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchPaymentRecordService } from 'src/modules/payments/use-cases/fetch-payment-record.service'
import { UpdatePaymentRecordService } from 'src/modules/payments/use-cases/update-payment-record.service'

type TasksRepositoryMock = jest.Mocked<
  Pick<TasksRepository, 'fetchTaskById' | 'updateTaskStatus'>
>

type StripeServiceMock = jest.Mocked<Pick<StripeService, 'refundPayment'>>

type FetchPaymentRecordServiceMock = jest.Mocked<
  Pick<FetchPaymentRecordService, 'execute'>
>

type UpdatePaymentRecordServiceMock = jest.Mocked<
  Pick<UpdatePaymentRecordService, 'execute'>
>

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000)

const makePaymentRecord = () =>
  ({
    id: 'pay-1',
    amount: 50,
    refundId: null,
    taskId: 'task-1',
    paymentIntent: 'pi_123',
  }) as unknown as Awaited<ReturnType<FetchPaymentRecordService['execute']>>

describe('CancelTaskService', () => {
  let service: CancelTaskService
  let stripeService: StripeServiceMock
  let tasksRepository: TasksRepositoryMock
  let fetchPaymentRecordService: FetchPaymentRecordServiceMock
  let updatePaymentRecordService: UpdatePaymentRecordServiceMock

  beforeEach(() => {
    stripeService = { refundPayment: jest.fn() }
    tasksRepository = {
      fetchTaskById: jest.fn(),
      updateTaskStatus: jest.fn(),
    }
    fetchPaymentRecordService = { execute: jest.fn() }
    updatePaymentRecordService = { execute: jest.fn() }

    service = new CancelTaskService(
      stripeService as unknown as StripeService,
      tasksRepository as unknown as TasksRepository,
      fetchPaymentRecordService as unknown as FetchPaymentRecordService,
      updatePaymentRecordService as unknown as UpdatePaymentRecordService,
    )
  })

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws cannotCancelTask when requester is not the task owner', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({
        owner: 'someone-else',
        status: 'in_progress',
        startedAt: hoursAgo(0),
      }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotCancelTask.errorCode,
    })

    expect(fetchPaymentRecordService.execute).not.toHaveBeenCalled()
    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws cannotCancelTask when the task status is terminal', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'completed' }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotCancelTask.errorCode,
    })

    expect(fetchPaymentRecordService.execute).not.toHaveBeenCalled()
    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws cannotCancelTask when in_progress task started more than 1 hour ago', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(2) }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotCancelTask.errorCode,
    })

    expect(fetchPaymentRecordService.execute).not.toHaveBeenCalled()
    expect(stripeService.refundPayment).not.toHaveBeenCalled()
    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('cancels an available task without refund (no payment yet)', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'available', startedAt: null }),
    )
    fetchPaymentRecordService.execute.mockResolvedValue(null)

    await service.execute({ taskId: 'task-1', userId: 'client-1' })

    expect(stripeService.refundPayment).not.toHaveBeenCalled()
    expect(tasksRepository.updateTaskStatus).toHaveBeenCalledWith({
      taskId: 'task-1',
      status: 'canceled',
      canceledAt: expect.any(Date),
    })
    expect(updatePaymentRecordService.execute).not.toHaveBeenCalled()
  })

  it('cancels an in_progress task without refund when there is no payment record', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    fetchPaymentRecordService.execute.mockResolvedValue(null)

    await service.execute({ taskId: 'task-1', userId: 'client-1' })

    expect(stripeService.refundPayment).not.toHaveBeenCalled()
    expect(tasksRepository.updateTaskStatus).toHaveBeenCalledWith({
      taskId: 'task-1',
      status: 'canceled',
      canceledAt: expect.any(Date),
    })
  })

  it('refunds, cancels and updates the payment record on the happy path', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    const paymentRecord = makePaymentRecord()
    fetchPaymentRecordService.execute.mockResolvedValue(paymentRecord)
    stripeService.refundPayment.mockResolvedValue({
      id: 're_123',
      status: 'succeeded',
    } as Awaited<ReturnType<StripeService['refundPayment']>>)

    await service.execute({ taskId: 'task-1', userId: 'client-1' })

    expect(stripeService.refundPayment).toHaveBeenCalledWith('pi_123')
    expect(tasksRepository.updateTaskStatus).toHaveBeenCalledWith({
      taskId: 'task-1',
      status: 'canceled',
      canceledAt: expect.any(Date),
    })
    expect(updatePaymentRecordService.execute).toHaveBeenCalledWith('task-1', {
      ...paymentRecord,
      refundId: 're_123',
    })
  })

  it('throws refundFailed when Stripe refund does not succeed', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    fetchPaymentRecordService.execute.mockResolvedValue(makePaymentRecord())
    stripeService.refundPayment.mockResolvedValue({
      id: 're_123',
      status: 'pending',
    } as Awaited<ReturnType<StripeService['refundPayment']>>)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.payment.refundFailed.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
    expect(updatePaymentRecordService.execute).not.toHaveBeenCalled()
  })

  it('throws refundFailed when Stripe throws during refund', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: hoursAgo(0) }),
    )
    fetchPaymentRecordService.execute.mockResolvedValue(makePaymentRecord())
    stripeService.refundPayment.mockRejectedValue(new Error('stripe down'))

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.payment.refundFailed.errorCode,
    })
  })
})
