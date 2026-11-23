import { Readable } from 'node:stream'

import {
  FetchTaskProofService,
  mimeTypeFromPath,
} from './fetch-task-proof.service'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { ProofNotFoundError } from 'src/storage/proof-storage'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'

import type { ProofStorage } from 'src/storage/proof-storage'

describe('FetchTaskProofService', () => {
  let service: FetchTaskProofService
  let tasksRepository: jest.Mocked<
    Pick<TasksRepository, 'fetchTaskById' | 'fetchTaskMappingByTaskId'>
  >
  let storage: jest.Mocked<ProofStorage>

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
    }
    storage = { put: jest.fn(), getStream: jest.fn() }
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ proofImageUrl: 'task-1/p.jpg', owner: 'client-1' }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'proxy-1' }),
    )
    service = new FetchTaskProofService(
      tasksRepository as unknown as TasksRepository,
      storage,
    )
  })

  it('maps .heif to image/heif', () => {
    expect(mimeTypeFromPath('x.heif')).toBe('image/heif')
  })

  it('hides the proof from strangers with a 404', async () => {
    await expect(
      service.execute('task-1', { userId: 'stranger' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })
    expect(storage.getStream).not.toHaveBeenCalled()
  })

  it('maps ProofNotFoundError to a 404', async () => {
    storage.getStream.mockRejectedValue(new ProofNotFoundError('task-1/p.jpg'))

    await expect(
      service.execute('task-1', { userId: 'client-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })
  })

  it('maps any other storage error to a 404 without leaking details', async () => {
    storage.getStream.mockRejectedValue(new Error('secret bucket detail'))

    const error = await service
      .execute('task-1', { userId: 'client-1' })
      .catch((e) => e)

    expect(error).toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })
    expect(JSON.stringify(error.getResponse())).not.toContain('secret')
  })

  it('returns the stream and mime type for the owner', async () => {
    const stream = Readable.from([Buffer.from('x')])
    storage.getStream.mockResolvedValue(stream)

    await expect(
      service.execute('task-1', { userId: 'client-1' }),
    ).resolves.toEqual({ stream, mimeType: 'image/jpeg' })
  })
})
