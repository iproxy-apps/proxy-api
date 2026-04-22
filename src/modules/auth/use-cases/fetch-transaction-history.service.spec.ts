import { Prisma } from '@prisma/client'

import { makeUser } from '../test-utils/user.factory'
import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'
import { FetchTransactionHistoryService } from './fetch-transaction-history.service'

import type { TransactionHistoryTask } from '../dtos/auth-repository.dto'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchTasksCreatedByUser' | 'fetchTasksCompletedByUser'>
>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

const makeTask = (
  overrides: Partial<TransactionHistoryTask> = {},
): TransactionHistoryTask => ({
  id: 'task-1',
  title: 'Task',
  status: 'completed',
  description: 'desc',
  createdAt: new Date('2026-01-01'),
  completedAt: new Date('2026-01-02'),
  offeredPrice: new Prisma.Decimal(100),
  ...overrides,
})

describe('FetchTransactionHistoryService', () => {
  let authRepository: AuthRepositoryMock
  let service: FetchTransactionHistoryService
  let fetchUserDetailsService: FetchUserDetailsServiceMock

  beforeEach(() => {
    authRepository = {
      fetchTasksCreatedByUser: jest.fn(),
      fetchTasksCompletedByUser: jest.fn(),
    }
    fetchUserDetailsService = { execute: jest.fn() }

    service = new FetchTransactionHistoryService(
      authRepository as unknown as AuthRepository,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
    )
  })

  it('propagates notFound when the user does not exist', async () => {
    fetchUserDetailsService.execute.mockRejectedValue(
      new AppException(errorDictionary.user.notFound),
    )

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.fetchTasksCreatedByUser).not.toHaveBeenCalled()
    expect(authRepository.fetchTasksCompletedByUser).not.toHaveBeenCalled()
  })

  it('returns empty lists when user has no history', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeUser())
    authRepository.fetchTasksCreatedByUser.mockResolvedValue([])
    authRepository.fetchTasksCompletedByUser.mockResolvedValue([])

    const result = await service.execute('user-1')

    expect(result).toEqual({ tasksCreated: [], tasksCompleted: [] })
  })

  it('returns created tasks untouched and computes netAmount for completed tasks', async () => {
    const createdTask = makeTask({
      id: 'created-1',
      completedAt: null,
      status: 'available',
      offeredPrice: new Prisma.Decimal(200),
    })

    const completedTask = makeTask({
      id: 'completed-1',
      offeredPrice: new Prisma.Decimal(100),
    })

    fetchUserDetailsService.execute.mockResolvedValue(makeUser())
    authRepository.fetchTasksCreatedByUser.mockResolvedValue([createdTask])
    authRepository.fetchTasksCompletedByUser.mockResolvedValue([completedTask])

    const result = await service.execute('user-1')

    expect(authRepository.fetchTasksCreatedByUser).toHaveBeenCalledWith(
      'user-1',
    )

    expect(authRepository.fetchTasksCompletedByUser).toHaveBeenCalledWith(
      'user-1',
    )

    expect(result.tasksCreated).toEqual([createdTask])

    // 100 - (100 * 0.0399 + 0.39) - (100 * 0.2) = 100 - 4.38 - 20 = 75.62
    expect(result.tasksCompleted).toEqual([
      { ...completedTask, netAmount: 75.62 },
    ])
  })

  it('rounds netAmount to two decimals', async () => {
    // 50 - (50 * 0.0399 + 0.39) - (50 * 0.2) = 50 - 2.385 - 10 = 37.615 -> 37.62
    const completedTask = makeTask({
      id: 'completed-2',
      offeredPrice: new Prisma.Decimal(50),
    })

    fetchUserDetailsService.execute.mockResolvedValue(makeUser())
    authRepository.fetchTasksCreatedByUser.mockResolvedValue([])
    authRepository.fetchTasksCompletedByUser.mockResolvedValue([completedTask])

    const result = await service.execute('user-1')

    expect(result.tasksCompleted[0].netAmount).toBe(37.62)
  })
})
