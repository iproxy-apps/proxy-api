import { AppException } from 'src/exception/app.exception'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { FetchTaskByIdService } from './fetch-task-by-id.service'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { PaymentRecord } from 'src/modules/payments/types'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    | 'fetchTaskById'
    | 'fetchTaskMappingByTaskId'
    | 'fetchTaskCounterpartById'
  >
>
type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchLatestByTaskId'>
>

const makePayment = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'pay-1',
  taskId: 'task-1',
  amount: 100 as unknown as PaymentRecord['amount'],
  status: 'succeeded',
  paymentIntent: 'pi_test_1',
  refundId: null,
  chargeId: null,
  disputeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('FetchTaskByIdService', () => {
  let service: FetchTaskByIdService
  let tasksRepository: TasksRepositoryMock
  let paymentsRepository: PaymentsRepositoryMock

  // Convenience default requester — Proxy so ownership check doesn't kick in
  // on tests that don't care about auth. Auth-specific tests declare their own.
  const proxyRequester = { userId: 'user-proxy', userType: 'PROXY' }

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn().mockResolvedValue(null),
      fetchTaskCounterpartById: jest.fn().mockResolvedValue(null),
    }
    paymentsRepository = { fetchLatestByTaskId: jest.fn().mockResolvedValue(null) }

    service = new FetchTaskByIdService(
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
    )
  })

  it('looks up the task by id without filtering by status', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskDetails())

    await service.execute('task-1', proxyRequester)

    expect(tasksRepository.fetchTaskById).toHaveBeenCalledWith({
      taskId: 'task-1',
    })
  })

  it('returns the task with payment=null and executor(Id)=null when neither exists', async () => {
    const task = makeTaskDetails({ id: 'task-1' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    const result = await service.execute('task-1', proxyRequester)

    expect(result).toEqual({
      ...task,
      payment: null,
      executorId: null,
      executor: null,
    })
    expect(tasksRepository.fetchTaskCounterpartById).not.toHaveBeenCalled()
  })

  it('returns executorId + executor from the task mapping when the task has an executor', async () => {
    const task = makeTaskDetails({ id: 'task-1', status: 'in_progress' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue({
      taskId: 'task-1',
      executorId: 'user-proxy-executor',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const executor = {
      id: 'user-proxy-executor',
      name: 'Jane Proxy',
      avatarUrl: null,
      rating: 4.8,
    } as unknown as Awaited<
      ReturnType<TasksRepository['fetchTaskCounterpartById']>
    >
    tasksRepository.fetchTaskCounterpartById.mockResolvedValue(executor)

    const result = await service.execute('task-1', proxyRequester)

    expect(tasksRepository.fetchTaskCounterpartById).toHaveBeenCalledWith(
      'user-proxy-executor',
    )
    expect(result.executorId).toBe('user-proxy-executor')
    expect(result.executor).toBe(executor)
  })

  it('returns the task with its payment record when present', async () => {
    const task = makeTaskDetails({ id: 'task-1' })
    const payment = makePayment({ taskId: 'task-1', status: 'pending' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(payment)

    const result = await service.execute('task-1', proxyRequester)

    expect(paymentsRepository.fetchLatestByTaskId).toHaveBeenCalledWith('task-1')
    expect(result.payment).toBe(payment)
  })

  it('throws taskNotFound when the repository returns null', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(
      service.execute('missing', proxyRequester),
    ).rejects.toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
    await expect(
      service.execute('missing', proxyRequester),
    ).rejects.toBeInstanceOf(AppException)
  })

  it('lets a CLIENT view their own task', async () => {
    const task = makeTaskDetails({ id: 'task-1', owner: 'user-client-1' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    const result = await service.execute('task-1', {
      userId: 'user-client-1',
      userType: 'CLIENT',
    })

    expect(result.id).toBe('task-1')
  })

  it("returns 404 when a CLIENT tries to view someone else's task", async () => {
    const task = makeTaskDetails({ id: 'task-1', owner: 'user-client-owner' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    await expect(
      service.execute('task-1', {
        userId: 'user-client-stranger',
        userType: 'CLIENT',
      }),
    ).rejects.toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
    // Payment lookup should not happen when auth fails.
    expect(paymentsRepository.fetchLatestByTaskId).not.toHaveBeenCalled()
  })

  it('lets a PROXY view a task owned by any user', async () => {
    const task = makeTaskDetails({ id: 'task-1', owner: 'user-client-owner' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    const result = await service.execute('task-1', {
      userId: 'user-random-proxy',
      userType: 'PROXY',
    })

    expect(result.id).toBe('task-1')
  })
})
