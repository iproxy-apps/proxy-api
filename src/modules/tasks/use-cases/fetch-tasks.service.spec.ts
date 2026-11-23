import { FetchTasksService, TASKS_PER_PAGE } from './fetch-tasks.service'
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

  it('returns the empty page without touching the repository for an unserved city', async () => {
    const result = await service.execute({ city: 'Curitiba', page: 1 })

    expect(tasksRepository.fetchAllTasks).not.toHaveBeenCalled()
    expect(result).toEqual({
      items: [],
      page: 1,
      perPage: TASKS_PER_PAGE,
      hasMore: false,
    })
  })

  it('canonicalises the city and computes skip/take from the page', async () => {
    tasksRepository.fetchAllTasks.mockResolvedValue([])

    await service.execute({ city: 'são paulo', page: 2 })

    expect(tasksRepository.fetchAllTasks).toHaveBeenCalledWith({
      city: 'São Paulo',
      skip: 10,
      take: 11,
    })
  })

  it('slices the extra row and flags hasMore', async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      makeTaskDetails({ id: `t${i}` }),
    )
    tasksRepository.fetchAllTasks.mockResolvedValue(rows)

    const result = await service.execute({ city: 'São Paulo', page: 1 })

    expect(result.items).toHaveLength(10)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.perPage).toBe(10)
  })

  it('reports hasMore false when the page is not overfull', async () => {
    tasksRepository.fetchAllTasks.mockResolvedValue([
      makeTaskDetails({ id: 't1' }),
    ])

    const result = await service.execute({ city: 'São Paulo', page: 3 })

    expect(result.items).toHaveLength(1)
    expect(result.hasMore).toBe(false)
  })
})
