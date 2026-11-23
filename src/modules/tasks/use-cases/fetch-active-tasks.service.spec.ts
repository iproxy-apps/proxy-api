import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { toTaskResponse } from '../utils/task-response'
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

  it('maps the repository rows to numeric task responses', async () => {
    const tasks = [makeTaskDetails({ id: 't1' }), makeTaskDetails({ id: 't2' })]
    tasksRepository.fetchActiveTasksForUser.mockResolvedValue(tasks)

    const result = await service.execute('user-1')

    expect(result).toEqual(tasks.map(toTaskResponse))
    expect(typeof result[0].offeredPrice).toBe('number')
  })
})
