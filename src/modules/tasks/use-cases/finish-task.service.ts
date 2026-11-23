import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { normalizeProofImage } from '../utils/proof-image'
import { PROOF_STORAGE } from 'src/storage/proof-storage'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { ProofStorage } from 'src/storage/proof-storage'
import type { FinishTaskData } from '../types'

@Injectable()
export class FinishTaskService {
  private readonly logger = new Logger(FinishTaskService.name)

  constructor(
    private tasksRepository: TasksRepository,
    private paymentsRepository: PaymentsRepository,
    @Inject(PROOF_STORAGE) private storage: ProofStorage,
  ) {}

  async execute(data: FinishTaskData): Promise<void> {
    const { taskId, userId, file } = data

    const taskDetails = await this.tasksRepository.fetchTaskById({
      taskId,
      status: 'in_progress',
    })

    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)

    const taskMapping =
      await this.tasksRepository.fetchTaskMappingByTaskId(taskId)

    if (!taskMapping) {
      throw new AppException(errorDictionary.tasks.taskMappingNotFound)
    }

    if (taskMapping.executorId !== userId) {
      throw new AppException(errorDictionary.tasks.cannotFinishTask)
    }

    if (!file) {
      throw new AppException(errorDictionary.tasks.proofPhotoRequired)
    }

    const payment = await this.paymentsRepository.fetchLatestByTaskId(taskId)
    if (payment?.status === 'disputed') {
      throw new AppException(errorDictionary.payment.disputed)
    }

    // NOTE: there is no time-based cutoff on finishing a task. The 1h grace
    // window only applies to the client's *cancel* action; the proxy's
    // *finish* action is bounded only by the `in_progress` status guard.

    const normalized = await normalizeProofImage(file.buffer)
    const key = `${taskId}/${randomUUID()}.jpg`

    try {
      await this.storage.put(key, normalized.buffer, 'image/jpeg')
    } catch (error) {
      this.logger.error(
        `Failed to store proof ${key}`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new AppException(errorDictionary.file.uploadFailed)
    }

    const transitioned = await this.tasksRepository.transition({
      taskId,
      from: ['in_progress'],
      to: 'verification_required',
      data: { completedAt: new Date(), proofImageUrl: key },
    })

    if (!transitioned) {
      this.logger.warn(`Orphan proof object left in storage: ${key}`)
      throw new AppException(errorDictionary.tasks.statusConflict)
    }
  }
}
