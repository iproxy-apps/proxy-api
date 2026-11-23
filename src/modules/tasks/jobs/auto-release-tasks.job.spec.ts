import { Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AutoReleaseTasksJob } from './auto-release-tasks.job'
import { errorDictionary } from 'src/exception/error-dictionary'
import { TasksRepository } from '../repository/tasks.repository'
import { ValidateTaskService } from '../use-cases/validate-task.service'

describe('AutoReleaseTasksJob', () => {
  let tasksRepository: jest.Mocked<
    Pick<TasksRepository, 'findStaleVerificationRequired'>
  >
  let validateTaskService: jest.Mocked<Pick<ValidateTaskService, 'execute'>>
  let job: AutoReleaseTasksJob

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    tasksRepository = { findStaleVerificationRequired: jest.fn() }
    validateTaskService = { execute: jest.fn() }
    job = new AutoReleaseTasksJob(
      tasksRepository as unknown as TasksRepository,
      validateTaskService as unknown as ValidateTaskService,
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('skips a task that rejects and still validates the next one', async () => {
    tasksRepository.findStaleVerificationRequired.mockResolvedValue([
      { id: 't1', owner: 'u1' },
      { id: 't2', owner: 'u2' },
      { id: 't3', owner: 'u3' },
    ])
    validateTaskService.execute
      .mockRejectedValueOnce(new AppException(errorDictionary.payment.disputed))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))

    const result = await job.execute(new Date('2026-11-23T06:00:00Z'))

    expect(result).toEqual({ released: ['t2'], skipped: ['t1', 't3'] })
    expect(validateTaskService.execute).toHaveBeenCalledWith({
      taskId: 't2',
      userId: 'u2',
    })
    const cutoff =
      tasksRepository.findStaleVerificationRequired.mock.calls[0][0]
    expect(cutoff.toISOString()).toBe('2026-11-16T06:00:00.000Z')
  })
})
