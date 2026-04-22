import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { UpdateTotalTasksCompletedService } from './update-total-tasks-completed.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'updateTotalTasksCompleted'>
>

describe('UpdateTotalTasksCompletedService', () => {
  let service: UpdateTotalTasksCompletedService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    authRepository = {
      fetchUserDetailsById: jest.fn(),
      updateTotalTasksCompleted: jest.fn(),
    }

    service = new UpdateTotalTasksCompletedService(
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(
      service.execute({ id: 'missing-user', tasksCompleted: 1 }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.updateTotalTasksCompleted).not.toHaveBeenCalled()
  })

  it('forwards the provided value to the repository when the user exists', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())

    await service.execute({ id: 'user-1', tasksCompleted: 5 })

    expect(authRepository.fetchUserDetailsById).toHaveBeenCalledWith('user-1')
    expect(authRepository.updateTotalTasksCompleted).toHaveBeenCalledWith(
      'user-1',
      5,
    )
  })
})
