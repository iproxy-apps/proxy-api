jest.mock('../utils/proof-image')

import { FinishTaskService } from './finish-task.service'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { normalizeProofImage } from '../utils/proof-image'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'

import type { ProofStorage } from 'src/storage/proof-storage'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    'fetchTaskById' | 'fetchTaskMappingByTaskId' | 'transition'
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
  let paymentsRepository: { fetchLatestByTaskId: jest.Mock }
  let storage: jest.Mocked<ProofStorage>

  const input = { taskId: 'task-1', userId: 'proxy-1', file: makeFile() }

  const arrangeHappyPath = () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue({
      status: 'succeeded',
      chargeId: 'ch_test_1',
    })
    tasksRepository.transition.mockResolvedValue(true)
  }

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
      transition: jest.fn(),
    }
    paymentsRepository = { fetchLatestByTaskId: jest.fn() }
    storage = { put: jest.fn(), getStream: jest.fn() }
    jest.mocked(normalizeProofImage).mockResolvedValue({
      buffer: Buffer.from('normalised'),
      contentType: 'image/jpeg',
      extension: '.jpg',
    })

    service = new FinishTaskService(
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
      storage,
    )
  })

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(service.execute(input)).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws taskMappingNotFound when there is no executor mapping', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(null)

    await expect(service.execute(input)).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskMappingNotFound.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws cannotFinishTask when the caller is not the executor', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'someone-else' }),
    )

    await expect(service.execute(input)).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotFinishTask.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws PROOF_PHOTO_REQUIRED when no file is provided', async () => {
    arrangeHappyPath()

    await expect(
      service.execute({ ...input, file: null }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.proofPhotoRequired.errorCode,
    })

    expect(storage.put).not.toHaveBeenCalled()
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws PAYMENT_DISPUTED without storing anything when the payment is disputed', async () => {
    arrangeHappyPath()
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue({
      status: 'disputed',
    })

    await expect(service.execute(input)).rejects.toMatchObject({
      errorCode: errorDictionary.payment.disputed.errorCode,
    })

    expect(storage.put).not.toHaveBeenCalled()
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it.each([
    ['no payment row', null],
    ['a pending payment', { status: 'pending', chargeId: null }],
    [
      'a succeeded payment without a charge id',
      { status: 'succeeded', chargeId: null },
    ],
  ])(
    'throws PAYMENT_NOT_CONFIRMED before any image work with %s',
    async (_label, payment) => {
      arrangeHappyPath()
      paymentsRepository.fetchLatestByTaskId.mockResolvedValue(payment)

      await expect(service.execute(input)).rejects.toMatchObject({
        errorCode: errorDictionary.payment.notConfirmed.errorCode,
      })

      expect(normalizeProofImage).not.toHaveBeenCalled()
      expect(storage.put).not.toHaveBeenCalled()
      expect(tasksRepository.transition).not.toHaveBeenCalled()
    },
  )

  it('stores the normalised proof and transitions with a CAS from in_progress', async () => {
    arrangeHappyPath()

    await service.execute(input)

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^task-1\/.+\.jpg$/),
      Buffer.from('normalised'),
      'image/jpeg',
    )
    const key = storage.put.mock.calls[0][0]
    expect(tasksRepository.transition).toHaveBeenCalledWith({
      taskId: 'task-1',
      from: ['in_progress'],
      to: 'verification_required',
      data: { completedAt: expect.any(Date), proofImageUrl: key },
    })
  })

  it('allows finishing regardless of how long ago the task started', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    arrangeHappyPath()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'in_progress', startedAt: twoHoursAgo }),
    )

    await service.execute(input)

    expect(tasksRepository.transition).toHaveBeenCalledTimes(1)
  })

  it('maps a storage failure to FILE_UPLOAD_FAILED without leaking the message', async () => {
    arrangeHappyPath()
    storage.put.mockRejectedValue(new Error('secret bucket detail'))

    const error = await service.execute(input).catch((e) => e)

    expect(error).toMatchObject({
      errorCode: errorDictionary.file.uploadFailed.errorCode,
    })
    expect(JSON.stringify(error.getResponse())).not.toContain('secret')
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws TASK_STATUS_CONFLICT when the CAS loses the race', async () => {
    arrangeHappyPath()
    tasksRepository.transition.mockResolvedValue(false)

    await expect(service.execute(input)).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.statusConflict.errorCode,
    })
  })
})
