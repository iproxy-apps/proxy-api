import { AppException } from 'src/exception/app.exception'
import { StripeService } from 'src/stripe/stripe.service'
import { ValidateTaskService } from './validate-task.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { TasksRepository } from '../repository/tasks.repository'
import { makeUser } from 'src/modules/auth/test-utils/user.factory'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'
import { RateProxyService } from 'src/modules/ratings/use-cases/rate-proxy.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'
import { UpdateWalletBalanceService } from 'src/modules/auth/use-cases/update-wallet-balance.service'
import { UpdateTotalTasksCompletedService } from 'src/modules/auth/use-cases/update-total-tasks-completed.service'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    'fetchTaskById' | 'fetchTaskMappingByTaskId' | 'validateTaskCompletion'
  >
>

type StripeServiceMock = jest.Mocked<Pick<StripeService, 'createTransfer'>>

type RateProxyServiceMock = jest.Mocked<Pick<RateProxyService, 'execute'>>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

type UpdateWalletBalanceServiceMock = jest.Mocked<
  Pick<UpdateWalletBalanceService, 'execute'>
>

type UpdateTotalTasksCompletedServiceMock = jest.Mocked<
  Pick<UpdateTotalTasksCompletedService, 'execute'>
>

const makeReadyProxy = () =>
  makeUser({
    id: 'proxy-1',
    userType: 'PROXY',
    stripeAccountId: 'acct_proxy_1',
    stripeAccountReady: true,
  })

describe('ValidateTaskService', () => {
  let service: ValidateTaskService
  let stripeService: StripeServiceMock
  let tasksRepository: TasksRepositoryMock
  let rateProxyService: RateProxyServiceMock
  let fetchUserDetailsService: FetchUserDetailsServiceMock
  let updateWalletBalanceService: UpdateWalletBalanceServiceMock
  let updateTotalTasksCompletedService: UpdateTotalTasksCompletedServiceMock

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      validateTaskCompletion: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
    }
    stripeService = {
      createTransfer: jest.fn().mockResolvedValue({ id: 'tr_test_1' }),
    }
    rateProxyService = { execute: jest.fn() }
    fetchUserDetailsService = {
      execute: jest.fn().mockResolvedValue(makeReadyProxy()),
    }
    updateWalletBalanceService = { execute: jest.fn() }
    updateTotalTasksCompletedService = { execute: jest.fn() }

    service = new ValidateTaskService(
      stripeService as unknown as StripeService,
      tasksRepository as unknown as TasksRepository,
      rateProxyService as unknown as RateProxyService,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
      updateWalletBalanceService as unknown as UpdateWalletBalanceService,
      updateTotalTasksCompletedService as unknown as UpdateTotalTasksCompletedService,
    )
  })

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.validateTaskCompletion).not.toHaveBeenCalled()
    expect(stripeService.createTransfer).not.toHaveBeenCalled()
    expect(updateWalletBalanceService.execute).not.toHaveBeenCalled()
    expect(updateTotalTasksCompletedService.execute).not.toHaveBeenCalled()
  })

  it('throws cannotValidateTask when requester is not the task owner', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ owner: 'someone-else' }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotValidateTask.errorCode,
    })

    expect(tasksRepository.validateTaskCompletion).not.toHaveBeenCalled()
  })

  it('throws taskMappingNotFound when there is no executor mapping', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskDetails())
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(null)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toBeInstanceOf(AppException)

    expect(tasksRepository.validateTaskCompletion).not.toHaveBeenCalled()
  })

  it('throws proxyAccountNotReady when the proxy cannot receive transfers', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskDetails())
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(makeTaskMapping())
    fetchUserDetailsService.execute.mockResolvedValue(
      makeUser({
        id: 'proxy-1',
        stripeAccountReady: false,
        stripeAccountId: null,
      }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.proxyAccountNotReady.errorCode,
    })

    expect(stripeService.createTransfer).not.toHaveBeenCalled()
    expect(tasksRepository.validateTaskCompletion).not.toHaveBeenCalled()
    expect(updateWalletBalanceService.execute).not.toHaveBeenCalled()
  })

  it('throws transferFailed and skips state changes when the transfer fails', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ offeredPrice: 100 }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(makeTaskMapping())
    stripeService.createTransfer.mockRejectedValue(new Error('stripe down'))

    await expect(
      service.execute({ taskId: 'task-1', userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.transferFailed.errorCode,
    })

    expect(tasksRepository.validateTaskCompletion).not.toHaveBeenCalled()
    expect(updateWalletBalanceService.execute).not.toHaveBeenCalled()
    expect(updateTotalTasksCompletedService.execute).not.toHaveBeenCalled()
  })

  it('creates a transfer, persists the transferId and pays the executor on the happy path', async () => {
    const offeredPrice = 100
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ offeredPrice }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(makeTaskMapping())

    await service.execute({ taskId: 'task-1', userId: 'client-1' })

    const expectedStripeFee = offeredPrice * 0.0399 + 0.39
    const expectedPlatformFee = offeredPrice * 0.2
    const expectedProxyEarnings =
      offeredPrice - expectedStripeFee - expectedPlatformFee
    const expectedAmountCents = Math.round(expectedProxyEarnings * 100)

    expect(stripeService.createTransfer).toHaveBeenCalledWith({
      amount: expectedAmountCents,
      destination: 'acct_proxy_1',
      metadata: { taskId: 'task-1' },
    })

    expect(tasksRepository.validateTaskCompletion).toHaveBeenCalledWith({
      taskId: 'task-1',
      transferId: 'tr_test_1',
      status: 'completed',
      platformFee: expectedPlatformFee,
      proxyEarnings: expectedProxyEarnings,
    })

    expect(updateTotalTasksCompletedService.execute).toHaveBeenCalledWith({
      id: 'proxy-1',
      tasksCompleted: 1,
    })

    expect(updateWalletBalanceService.execute).toHaveBeenCalledWith({
      userId: 'proxy-1',
      amount: expectedProxyEarnings,
    })
  })

  it('does not record a rating when none is provided', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskDetails())
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(makeTaskMapping())

    await service.execute({ taskId: 'task-1', userId: 'client-1' })

    expect(rateProxyService.execute).not.toHaveBeenCalled()
  })

  it('records the rating for the executor when provided', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskDetails())
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(makeTaskMapping())

    await service.execute({
      taskId: 'task-1',
      userId: 'client-1',
      rating: 5,
      comment: 'ótimo',
    })

    expect(rateProxyService.execute).toHaveBeenCalledWith({
      taskId: 'task-1',
      raterId: 'client-1',
      ratedId: 'proxy-1',
      score: 5,
      comment: 'ótimo',
    })
  })
})
