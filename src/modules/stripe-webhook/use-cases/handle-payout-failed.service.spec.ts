import Stripe from 'stripe'
import { Prisma } from '@prisma/client'

import { StripeService } from 'src/stripe/stripe.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'
import { makeUser } from 'src/modules/auth/test-utils/user.factory'
import { makeTaskDetails } from 'src/modules/tasks/test-utils/task.factory'
import { HandlePayoutFailedService } from './handle-payout-failed.service'

type StripeMock = jest.Mocked<
  Pick<StripeService, 'listPayoutTransactions' | 'reverseTransfer'>
>
type TasksRepoMock = jest.Mocked<
  Pick<
    TasksRepository,
    'fetchTaskByTransferId' | 'fetchTaskMappingByTaskId' | 'markPayoutFailed'
  >
>
type AuthRepoMock = jest.Mocked<
  Pick<
    AuthRepository,
    'fetchUserDetailsById' | 'updateWalletBalance' | 'updateTotalTasksCompleted'
  >
>

const makeTransfer = (id: string) =>
  ({ id, object: 'transfer' }) as Stripe.Transfer

describe('HandlePayoutFailedService', () => {
  let service: HandlePayoutFailedService
  let stripe: StripeMock
  let tasksRepository: TasksRepoMock
  let authRepository: AuthRepoMock
  let loggerError: jest.SpyInstance

  beforeEach(() => {
    stripe = {
      listPayoutTransactions: jest.fn().mockResolvedValue({ data: [] }),
      reverseTransfer: jest.fn().mockResolvedValue({ id: 'trr_1' }),
    }
    tasksRepository = {
      fetchTaskByTransferId: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
      markPayoutFailed: jest.fn(),
    }
    authRepository = {
      fetchUserDetailsById: jest.fn(),
      updateWalletBalance: jest.fn(),
      updateTotalTasksCompleted: jest.fn(),
    }

    service = new HandlePayoutFailedService(
      stripe as unknown as StripeService,
      authRepository as unknown as AuthRepository,
      tasksRepository as unknown as TasksRepository,
    )
    loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {})
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    loggerError.mockRestore()
  })

  it('logs and skips compensation when accountId is missing', async () => {
    await service.execute({ id: 'po_1' } as Stripe.Payout)

    expect(stripe.listPayoutTransactions).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  it('reverses the transfer, debits the wallet and marks the task as payout_failed', async () => {
    stripe.listPayoutTransactions.mockResolvedValue({
      data: [{ source: makeTransfer('tr_1') }],
    } as unknown as Stripe.Response<Stripe.ApiList<Stripe.BalanceTransaction>>)
    tasksRepository.fetchTaskByTransferId.mockResolvedValue(
      makeTaskDetails({
        id: 'task-1',
        offeredPrice: 100,
        proxyEarnings: new Prisma.Decimal(75.62),
        status: 'completed',
      }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue({
      taskId: 'task-1',
      executorId: 'proxy-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({
        id: 'proxy-1',
        totalTasksCompleted: 3,
        walletBalance: new Prisma.Decimal(200),
      }),
    )

    await service.execute(
      { id: 'po_1', failure_code: 'account_closed' } as Stripe.Payout,
      'acct_proxy',
    )

    expect(stripe.reverseTransfer).toHaveBeenCalledWith('tr_1')
    expect(tasksRepository.markPayoutFailed).toHaveBeenCalledWith('task-1')

    // 100 - (100 * 0.0399 + 0.39) - (100 * 0.2) = 75.62
    expect(authRepository.updateWalletBalance).toHaveBeenCalledWith(
      'proxy-1',
      expect.closeTo(200 - 75.62, 1),
    )
    expect(authRepository.updateTotalTasksCompleted).toHaveBeenCalledWith(
      'proxy-1',
      -1,
    )
  })

  it('skips non-transfer balance transactions and unknown transfer IDs', async () => {
    stripe.listPayoutTransactions.mockResolvedValue({
      data: [
        { source: { object: 'charge', id: 'ch_1' } },
        { source: makeTransfer('tr_unknown') },
      ],
    } as unknown as Stripe.Response<Stripe.ApiList<Stripe.BalanceTransaction>>)
    tasksRepository.fetchTaskByTransferId.mockResolvedValue(null)

    await service.execute(
      { id: 'po_1' } as Stripe.Payout,
      'acct_proxy',
    )

    expect(tasksRepository.fetchTaskByTransferId).toHaveBeenCalledWith(
      'tr_unknown',
    )
    expect(stripe.reverseTransfer).not.toHaveBeenCalled()
    expect(tasksRepository.markPayoutFailed).not.toHaveBeenCalled()
  })

  it('does not flip wallet/counter if reverseTransfer throws', async () => {
    stripe.listPayoutTransactions.mockResolvedValue({
      data: [{ source: makeTransfer('tr_1') }],
    } as unknown as Stripe.Response<Stripe.ApiList<Stripe.BalanceTransaction>>)
    tasksRepository.fetchTaskByTransferId.mockResolvedValue(makeTaskDetails())
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue({
      taskId: 'task-1',
      executorId: 'proxy-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    stripe.reverseTransfer.mockRejectedValue(new Error('stripe down'))

    await service.execute(
      { id: 'po_1' } as Stripe.Payout,
      'acct_proxy',
    )

    expect(authRepository.updateWalletBalance).not.toHaveBeenCalled()
    expect(authRepository.updateTotalTasksCompleted).not.toHaveBeenCalled()
    expect(tasksRepository.markPayoutFailed).not.toHaveBeenCalled()
  })
})
