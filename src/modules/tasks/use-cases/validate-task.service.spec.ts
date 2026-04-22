import { AppException } from 'src/exception/app.exception'
import { ValidateTaskService } from './validate-task.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { TasksRepository } from '../repository/tasks.repository'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'
import { UpdateWalletBalanceService } from 'src/modules/auth/use-cases/update-wallet-balance.service'
import { UpdateTotalTasksCompletedService } from 'src/modules/auth/use-cases/update-total-tasks-completed.service'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    'fetchTaskById' | 'fetchTaskMappingByTaskId' | 'validateTaskCompletion'
  >
>

type UpdateWalletBalanceServiceMock = jest.Mocked<
  Pick<UpdateWalletBalanceService, 'execute'>
>

type UpdateTotalTasksCompletedServiceMock = jest.Mocked<
  Pick<UpdateTotalTasksCompletedService, 'execute'>
>

describe('ValidateTaskService', () => {
  let service: ValidateTaskService
  let tasksRepository: TasksRepositoryMock
  let updateWalletBalanceService: UpdateWalletBalanceServiceMock
  let updateTotalTasksCompletedService: UpdateTotalTasksCompletedServiceMock

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      validateTaskCompletion: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
    }
    updateWalletBalanceService = { execute: jest.fn() }
    updateTotalTasksCompletedService = { execute: jest.fn() }

    service = new ValidateTaskService(
      tasksRepository as unknown as TasksRepository,
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

  it('calculates fees and pays the executor on the happy path', async () => {
    const offeredPrice = 100
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ offeredPrice }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )

    await service.execute({ taskId: 'task-1', userId: 'client-1' })

    const expectedStripeFee = offeredPrice * 0.0399 + 0.39
    const expectedProxyFee = offeredPrice * 0.2
    const expectedAmountToPay =
      offeredPrice - expectedStripeFee - expectedProxyFee

    expect(tasksRepository.validateTaskCompletion).toHaveBeenCalledWith({
      taskId: 'task-1',
      status: 'completed',
      platformFee: expectedStripeFee,
      proxyEarnings: expectedProxyFee,
    })

    expect(updateTotalTasksCompletedService.execute).toHaveBeenCalledWith({
      id: 'proxy-1',
      tasksCompleted: 1,
    })

    expect(updateWalletBalanceService.execute).toHaveBeenCalledWith({
      userId: 'proxy-1',
      amount: expectedAmountToPay,
    })
  })
})
