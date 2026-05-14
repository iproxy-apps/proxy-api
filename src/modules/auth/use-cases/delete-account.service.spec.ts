import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'
import { DeleteAccountService } from './delete-account.service'
import { makeTaskDetails } from 'src/modules/tasks/test-utils/task.factory'
import { makeUser } from '../test-utils/user.factory'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'softDeleteUser'>
>

type TasksRepositoryMock = jest.Mocked<
  Pick<TasksRepository, 'fetchActiveTasksForUser'>
>

describe('DeleteAccountService', () => {
  let service: DeleteAccountService
  let authRepository: AuthRepositoryMock
  let tasksRepository: TasksRepositoryMock

  beforeEach(() => {
    authRepository = {
      fetchUserDetailsById: jest.fn(),
      softDeleteUser: jest.fn(),
    }
    tasksRepository = {
      fetchActiveTasksForUser: jest.fn().mockResolvedValue([]),
    }

    service = new DeleteAccountService(
      authRepository as unknown as AuthRepository,
      tasksRepository as unknown as TasksRepository,
    )
  })

  it('throws userNotFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(service.execute('missing')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
    expect(authRepository.softDeleteUser).not.toHaveBeenCalled()
  })

  it('throws userNotFound when the user is already deleted', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({ isDeleted: true }),
    )

    await expect(service.execute('user-1')).rejects.toBeInstanceOf(AppException)
    expect(authRepository.softDeleteUser).not.toHaveBeenCalled()
  })

  it('blocks deletion when the user has active tasks', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())
    tasksRepository.fetchActiveTasksForUser.mockResolvedValue([
      makeTaskDetails({ status: 'in_progress' }),
    ])

    await expect(service.execute('user-1')).rejects.toMatchObject({
      errorCode: errorDictionary.user.cannotDeleteWithActiveTasks.errorCode,
    })
    expect(authRepository.softDeleteUser).not.toHaveBeenCalled()
  })

  it('soft-deletes the user when no active tasks exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())

    await service.execute('user-1')

    expect(tasksRepository.fetchActiveTasksForUser).toHaveBeenCalledWith('user-1')
    expect(authRepository.softDeleteUser).toHaveBeenCalledWith('user-1')
  })
})
