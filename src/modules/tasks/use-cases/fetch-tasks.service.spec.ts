import { FetchTasksService } from './fetch-tasks.service'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'

type TasksRepositoryMock = jest.Mocked<Pick<TasksRepository, 'fetchAllTasks'>>

describe('FetchTasksService', () => {
  let service: FetchTasksService
  let tasksRepository: TasksRepositoryMock

  beforeEach(() => {
    tasksRepository = { fetchAllTasks: jest.fn() }

    service = new FetchTasksService(
      tasksRepository as unknown as TasksRepository,
    )
  })

  it('computes skip from page number with a fixed perPage of 10', async () => {
    tasksRepository.fetchAllTasks.mockResolvedValue([])

    await service.execute({ page: 1, city: 'São Paulo' })
    expect(tasksRepository.fetchAllTasks).toHaveBeenLastCalledWith({
      skip: 0,
      perPage: 10,
      city: 'São Paulo',
    })

    await service.execute({ page: 3, city: 'São Paulo' })
    expect(tasksRepository.fetchAllTasks).toHaveBeenLastCalledWith({
      skip: 20,
      perPage: 10,
      city: 'São Paulo',
    })
  })

  it('returns the tasks from the repository as-is', async () => {
    const tasks = [makeTaskDetails({ id: 't1' }), makeTaskDetails({ id: 't2' })]
    tasksRepository.fetchAllTasks.mockResolvedValue(tasks)

    const result = await service.execute({ page: 1, city: 'SP' })

    expect(result).toBe(tasks)
  })
})
