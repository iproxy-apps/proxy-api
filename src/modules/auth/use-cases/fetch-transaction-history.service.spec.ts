import { Prisma } from '@prisma/client'

import { makeUser } from '../test-utils/user.factory'
import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'
import {
  HISTORY_PER_PAGE,
  toTaskSummary,
  FetchTransactionHistoryService,
} from './fetch-transaction-history.service'

import type { HistoryTaskRow } from '../dtos/auth-repository.dto'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchTasksCreatedByUser' | 'fetchTasksExecutedByUser'>
>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

const makeRow = (overrides: Partial<HistoryTaskRow> = {}): HistoryTaskRow => ({
  id: 'task-1',
  title: 'Task',
  status: 'completed',
  city: 'São Paulo',
  offeredPrice: new Prisma.Decimal(100),
  chargedAmount: new Prisma.Decimal(100),
  proxyEarnings: new Prisma.Decimal(80),
  createdAt: new Date('2026-01-01'),
  completedAt: new Date('2026-01-02'),
  canceledAt: null,
  ...overrides,
})

describe('toTaskSummary netAmount', () => {
  it('executor + completed: the stored proxyEarnings', () => {
    const summary = toTaskSummary(makeRow(), 'executor')
    expect(summary.netAmount).toBe(80)
    expect(typeof summary.offeredPrice).toBe('number')
  })

  it('executor + canceled: 0', () => {
    expect(
      toTaskSummary(makeRow({ status: 'canceled' }), 'executor').netAmount,
    ).toBe(0)
  })

  it('executor + legacy row without proxyEarnings: 0', () => {
    expect(
      toTaskSummary(makeRow({ proxyEarnings: null }), 'executor').netAmount,
    ).toBe(0)
  })

  it('owner + completed: chargedAmount, falling back to offeredPrice', () => {
    expect(toTaskSummary(makeRow(), 'owner').netAmount).toBe(100)
    expect(
      toTaskSummary(
        makeRow({
          chargedAmount: null,
          offeredPrice: new Prisma.Decimal('80.5'),
        }),
        'owner',
      ).netAmount,
    ).toBe(80.5)
  })

  it('owner + not completed: 0', () => {
    expect(
      toTaskSummary(makeRow({ status: 'canceled' }), 'owner').netAmount,
    ).toBe(0)
    expect(
      toTaskSummary(makeRow({ status: 'available' }), 'owner').netAmount,
    ).toBe(0)
  })
})

describe('FetchTransactionHistoryService', () => {
  let authRepository: AuthRepositoryMock
  let service: FetchTransactionHistoryService
  let fetchUserDetailsService: FetchUserDetailsServiceMock

  beforeEach(() => {
    authRepository = {
      fetchTasksCreatedByUser: jest.fn(),
      fetchTasksExecutedByUser: jest.fn(),
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

    await expect(service.execute('missing-user', 1)).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.fetchTasksCreatedByUser).not.toHaveBeenCalled()
    expect(authRepository.fetchTasksExecutedByUser).not.toHaveBeenCalled()
  })

  it('returns the empty shape when user has no history', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeUser())
    authRepository.fetchTasksCreatedByUser.mockResolvedValue([])
    authRepository.fetchTasksExecutedByUser.mockResolvedValue([])

    const result = await service.execute('user-1', 1)

    expect(result).toEqual({
      tasksCreated: [],
      tasksCompleted: [],
      page: 1,
      perPage: HISTORY_PER_PAGE,
      hasMore: false,
    })
  })

  it('fetches take = perPage + 1 with skip from the page and slices the extra row', async () => {
    const rows = Array.from({ length: HISTORY_PER_PAGE + 1 }, (_, i) =>
      makeRow({ id: `t-${i}` }),
    )
    fetchUserDetailsService.execute.mockResolvedValue(makeUser())
    authRepository.fetchTasksCreatedByUser.mockResolvedValue(rows)
    authRepository.fetchTasksExecutedByUser.mockResolvedValue([])

    const result = await service.execute('user-1', 3)

    const pageArgs = { skip: 2 * HISTORY_PER_PAGE, take: HISTORY_PER_PAGE + 1 }
    expect(authRepository.fetchTasksCreatedByUser).toHaveBeenCalledWith(
      'user-1',
      pageArgs,
    )
    expect(authRepository.fetchTasksExecutedByUser).toHaveBeenCalledWith(
      'user-1',
      pageArgs,
    )
    expect(result.tasksCreated).toHaveLength(HISTORY_PER_PAGE)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(3)
  })

  it('sets hasMore when only the executed list overflows', async () => {
    fetchUserDetailsService.execute.mockResolvedValue(makeUser())
    authRepository.fetchTasksCreatedByUser.mockResolvedValue([])
    authRepository.fetchTasksExecutedByUser.mockResolvedValue(
      Array.from({ length: HISTORY_PER_PAGE + 1 }, (_, i) =>
        makeRow({ id: `e-${i}` }),
      ),
    )

    const result = await service.execute('user-1', 1)

    expect(result.tasksCompleted).toHaveLength(HISTORY_PER_PAGE)
    expect(result.hasMore).toBe(true)
  })
})
