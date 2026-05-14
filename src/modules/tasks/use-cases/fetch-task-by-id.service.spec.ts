import { AppException } from 'src/exception/app.exception'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { FetchTaskByIdService } from './fetch-task-by-id.service'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { PaymentRecord } from 'src/modules/payments/types'

type TasksRepositoryMock = jest.Mocked<Pick<TasksRepository, 'fetchTaskById'>>
type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchPaymentRecord'>
>

const makePayment = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'pay-1',
  taskId: 'task-1',
  amount: 100 as unknown as PaymentRecord['amount'],
  status: 'succeeded',
  paymentIntent: 'pi_test_1',
  refundId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('FetchTaskByIdService', () => {
  let service: FetchTaskByIdService
  let tasksRepository: TasksRepositoryMock
  let paymentsRepository: PaymentsRepositoryMock

  beforeEach(() => {
    tasksRepository = { fetchTaskById: jest.fn() }
    paymentsRepository = { fetchPaymentRecord: jest.fn().mockResolvedValue(null) }

    service = new FetchTaskByIdService(
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
    )
  })

  it('looks up the task by id without filtering by status', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskDetails())

    await service.execute('task-1')

    expect(tasksRepository.fetchTaskById).toHaveBeenCalledWith({
      taskId: 'task-1',
    })
  })

  it('returns the task with payment=null when no payment record exists', async () => {
    const task = makeTaskDetails({ id: 'task-1' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    const result = await service.execute('task-1')

    expect(result).toEqual({ ...task, payment: null })
  })

  it('returns the task with its payment record when present', async () => {
    const task = makeTaskDetails({ id: 'task-1' })
    const payment = makePayment({ taskId: 'task-1', status: 'pending' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)
    paymentsRepository.fetchPaymentRecord.mockResolvedValue(payment)

    const result = await service.execute('task-1')

    expect(paymentsRepository.fetchPaymentRecord).toHaveBeenCalledWith('task-1')
    expect(result.payment).toBe(payment)
  })

  it('throws taskNotFound when the repository returns null', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(service.execute('missing')).rejects.toMatchObject({
      errorCode: 'TASK_NOT_FOUND',
    })
    await expect(service.execute('missing')).rejects.toBeInstanceOf(AppException)
  })
})
