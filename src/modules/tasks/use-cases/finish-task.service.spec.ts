jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}))

import { mkdirSync, writeFileSync } from 'fs'

import { FinishTaskService } from './finish-task.service'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    'fetchTaskById' | 'fetchTaskMappingByTaskId' | 'updateTaskStatus'
  >
>

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    size: 1024,
    encoding: '7bit',
    fieldname: 'file',
    mimetype: 'image/jpeg',
    originalname: 'proof.jpg',
    buffer: Buffer.from('fake-image'),
    ...overrides,
  }) as Express.Multer.File

describe('FinishTaskService', () => {
  let service: FinishTaskService
  let tasksRepository: TasksRepositoryMock

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      updateTaskStatus: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
    }

    service = new FinishTaskService(
      tasksRepository as unknown as TasksRepository,
    )
  })

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1', file: null }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws taskMappingNotFound when there is no executor mapping', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(null)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1', file: null }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskMappingNotFound.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws cannotFinishTask when the caller is not the executor', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'someone-else' }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1', file: null }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotFinishTask.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws taskStartedAtNotValid when started more than 1 hour ago', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: twoHoursAgo }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1', file: null }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskStartedAtNotValid.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('marks the task as verification_required without filePath when no file is provided', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )

    await service.execute({ taskId: 'task-1', userId: 'proxy-1', file: null })

    expect(tasksRepository.updateTaskStatus).toHaveBeenCalledWith({
      filePath: null,
      taskId: 'task-1',
      status: 'verification_required',
      completedAt: expect.any(Date),
    })
    expect(mkdirSync).not.toHaveBeenCalled()
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it('writes the proof image to disk and stores the relative path', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )

    await service.execute({
      taskId: 'task-1',
      userId: 'proxy-1',
      file: makeFile({ mimetype: 'image/png' }),
    })

    expect(mkdirSync).toHaveBeenCalledTimes(1)
    expect(writeFileSync).toHaveBeenCalledTimes(1)

    const updateArgs = tasksRepository.updateTaskStatus.mock.calls[0][0]
    expect(updateArgs.filePath).toMatch(/^task-1\/\d+-\d+\.png$/)
    expect(updateArgs.status).toBe('verification_required')
  })
})
