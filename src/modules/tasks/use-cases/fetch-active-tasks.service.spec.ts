import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { FetchActiveTasksService } from './fetch-active-tasks.service'

type TasksRepositoryMock = jest.Mocked<
  Pick<TasksRepository, 'fetchActiveTasksForUser'>
>

describe('FetchActiveTasksService', () => {
  let service: FetchActiveTasksService
  let tasksRepository: TasksRepositoryMock

  beforeEach(() => {
    tasksRepository = { fetchActiveTasksForUser: jest.fn() }

    service = new FetchActiveTasksService(
      tasksRepository as unknown as TasksRepository,
    )
  })

  it('delegates the lookup to the repository with the given user id', async () => {
    tasksRepository.fetchActiveTasksForUser.mockResolvedValue([])

    await service.execute('user-1')

    expect(tasksRepository.fetchActiveTasksForUser).toHaveBeenCalledWith('user-1')
  })

  it('returns the tasks from the repository as-is', async () => {
    const tasks = [makeTaskDetails({ id: 't1' }), makeTaskDetails({ id: 't2' })]
    tasksRepository.fetchActiveTasksForUser.mockResolvedValue(tasks)

    const result = await service.execute('user-1')

    expect(result).toBe(tasks)
  })
})
