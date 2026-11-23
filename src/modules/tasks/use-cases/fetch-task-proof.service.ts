import { Inject, Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { PROOF_STORAGE, ProofNotFoundError } from 'src/storage/proof-storage'

import type { Readable } from 'node:stream'
import type { ProofStorage } from 'src/storage/proof-storage'

type Requester = {
  userId: string
}

export type FetchTaskProofResult = {
  stream: Readable
  mimeType: string
}

@Injectable()
export class FetchTaskProofService {
  private readonly logger = new Logger(FetchTaskProofService.name)

  constructor(
    private tasksRepository: TasksRepository,
    @Inject(PROOF_STORAGE) private storage: ProofStorage,
  ) {}

  async execute(
    taskId: string,
    requester: Requester,
  ): Promise<FetchTaskProofResult> {
    const task = await this.tasksRepository.fetchTaskById({ taskId })
    if (!task || !task.proofImageUrl) {
      throw new AppException(errorDictionary.tasks.taskNotFound)
    }

    const isOwner = task.owner === requester.userId

    let isExecutor = false
    if (!isOwner) {
      const mapping =
        await this.tasksRepository.fetchTaskMappingByTaskId(taskId)
      isExecutor = mapping?.executorId === requester.userId
    }

    if (!isOwner && !isExecutor) {
      // 404 rather than 403 to avoid leaking existence.
      throw new AppException(errorDictionary.tasks.taskNotFound)
    }

    try {
      const stream = await this.storage.getStream(task.proofImageUrl)
      return { stream, mimeType: mimeTypeFromPath(task.proofImageUrl) }
    } catch (error) {
      if (!(error instanceof ProofNotFoundError)) {
        this.logger.error(
          `Failed to read proof ${task.proofImageUrl}`,
          error instanceof Error ? error.stack : undefined,
        )
      }
      throw new AppException(errorDictionary.tasks.taskNotFound)
    }
  }
}

export function mimeTypeFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  return 'image/jpeg'
}
