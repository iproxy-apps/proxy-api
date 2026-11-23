import { Prisma } from '@prisma/client'
import { toPaymentResponse, toTaskResponse } from '../utils/task-response'
import { AppException } from 'src/exception/app.exception'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { FetchTaskByIdService } from './fetch-task-by-id.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { UserType } from 'src/modules/auth/types'
import type { TaskRow } from '../types'
import type { PaymentRecord } from 'src/modules/payments/types'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    | 'fetchTaskById'
    | 'fetchTaskMappingByTaskId'
    | 'fetchTaskCounterpartById'
  >
>
type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchPhoneNumberById'>
>
type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchLatestByTaskId'>
>

const makePayment = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'pay-1',
  taskId: 'task-1',
  amount: new Prisma.Decimal(100),
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
  let authRepository: AuthRepositoryMock

  const requester = (userId: string, userType: UserType) => ({
    userId,
    userType,
  })
  const mapping = {
    taskId: 'task-1',
    executorId: 'proxy-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const executorRow = {
    id: 'proxy-1',
    name: 'Jane Proxy',
    avatarUrl: null,
    rating: new Prisma.Decimal('4.8'),
    totalTasksCreated: 0,
  }

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn().mockResolvedValue(null),
      fetchTaskCounterpartById: jest.fn().mockResolvedValue(null),
    }
    paymentsRepository = {
      fetchLatestByTaskId: jest.fn().mockResolvedValue(null),
    }
    authRepository = {
      fetchPhoneNumberById: jest
        .fn()
        .mockImplementation(async (id: string) => `phone-of-${id}`),
    }

    service = new FetchTaskByIdService(
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
      authRepository as unknown as AuthRepository,
    )
  })

  const seed = (status: TaskRow['status'], withMapping = true) => {
    const task = makeTaskDetails({ id: 'task-1', owner: 'client-1', status })
    tasksRepository.fetchTaskById.mockResolvedValue(task)
    if (withMapping) {
      tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(mapping)
      tasksRepository.fetchTaskCounterpartById.mockResolvedValue(executorRow)
    }
    return task
  }

  it('looks up the task by id without filtering by status', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ owner: 'client-1' }),
    )

    await service.execute('task-1', requester('client-1', 'CLIENT'))

    expect(tasksRepository.fetchTaskById).toHaveBeenCalledWith({
      taskId: 'task-1',
    })
  })

  it('throws taskNotFound when the repository returns null', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(
      service.execute('missing', requester('client-1', 'CLIENT')),
    ).rejects.toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
    await expect(
      service.execute('missing', requester('client-1', 'CLIENT')),
    ).rejects.toBeInstanceOf(AppException)
  })

  it('returns the owner view with payment=null and executor=null when nothing exists', async () => {
    const task = makeTaskDetails({ id: 'task-1', owner: 'client-1' })
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    const result = await service.execute(
      'task-1',
      requester('client-1', 'CLIENT'),
    )

    expect(result).toEqual({
      ...toTaskResponse(task),
      payment: null,
      executorId: null,
      executor: null,
    })
    expect(tasksRepository.fetchTaskCounterpartById).not.toHaveBeenCalled()
  })

  it('gives the owner a stripped, numeric payment and the executor with phone in progress', async () => {
    seed('in_progress')
    const record = makePayment({ taskId: 'task-1', status: 'pending' })
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(record)

    const result = await service.execute(
      'task-1',
      requester('client-1', 'CLIENT'),
    )

    expect(result.payment).toEqual(toPaymentResponse(record))
    expect(result.payment).not.toHaveProperty('paymentIntent')
    expect(result.payment).not.toHaveProperty('chargeId')
    expect(result.payment).not.toHaveProperty('disputeId')
    expect(result.payment?.amount).toBe(100)
    expect(result.executorId).toBe('proxy-1')
    expect(result.executor).toEqual({
      ...executorRow,
      rating: 4.8,
      phoneNumber: 'phone-of-proxy-1',
    })
    expect(result.ownerId).not.toHaveProperty('phoneNumber')
  })

  it('omits the executor phone from the owner once the task is completed', async () => {
    seed('completed')

    const result = await service.execute(
      'task-1',
      requester('client-1', 'CLIENT'),
    )

    expect(result.executor).not.toHaveProperty('phoneNumber')
    expect(authRepository.fetchPhoneNumberById).not.toHaveBeenCalled()
  })

  it('lets the executor read an in_progress task with the owner phone and no payment', async () => {
    seed('in_progress')

    const result = await service.execute(
      'task-1',
      requester('proxy-1', 'PROXY'),
    )

    expect(result.ownerId.phoneNumber).toBe('phone-of-client-1')
    expect(result.executor).not.toHaveProperty('phoneNumber')
    expect(result.payment).toBeNull()
    expect(paymentsRepository.fetchLatestByTaskId).not.toHaveBeenCalled()
  })

  it('hides the owner phone from the executor on a completed task', async () => {
    seed('completed')

    const result = await service.execute(
      'task-1',
      requester('proxy-1', 'PROXY'),
    )

    expect(result.ownerId).not.toHaveProperty('phoneNumber')
  })

  it('lets a stranger PROXY view an available task without phone or payment', async () => {
    seed('available', false)

    const result = await service.execute(
      'task-1',
      requester('proxy-x', 'PROXY'),
    )

    expect(result.id).toBe('task-1')
    expect(result.ownerId).not.toHaveProperty('phoneNumber')
    expect(result.payment).toBeNull()
  })

  it('returns 404 to a stranger PROXY on a non-available task', async () => {
    seed('in_progress')

    await expect(
      service.execute('task-1', requester('proxy-x', 'PROXY')),
    ).rejects.toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
    expect(paymentsRepository.fetchLatestByTaskId).not.toHaveBeenCalled()
  })

  it("returns 404 when a CLIENT tries to view someone else's task", async () => {
    seed('available', false)

    await expect(
      service.execute('task-1', requester('client-x', 'CLIENT')),
    ).rejects.toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })
})
