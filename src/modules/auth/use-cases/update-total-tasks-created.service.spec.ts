import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { UpdateTotalTasksCreatedService } from './update-total-tasks-created.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'updateTotalTasksCreated'>
>

describe('UpdateTotalTasksCreatedService', () => {
  let authRepository: AuthRepositoryMock
  let service: UpdateTotalTasksCreatedService

  beforeEach(() => {
    authRepository = {
      fetchUserDetailsById: jest.fn(),
      updateTotalTasksCreated: jest.fn(),
    }

    service = new UpdateTotalTasksCreatedService(
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(
      service.execute({ id: 'missing-user', tasksCreated: 1 }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.updateTotalTasksCreated).not.toHaveBeenCalled()
  })

  it('forwards the provided value to the repository when the user exists', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(makeUser())

    await service.execute({ id: 'user-1', tasksCreated: 7 })

    expect(authRepository.fetchUserDetailsById).toHaveBeenCalledWith('user-1')
    expect(authRepository.updateTotalTasksCreated).toHaveBeenCalledWith(
      'user-1',
      7,
    )
  })
})
