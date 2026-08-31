import { join } from 'path'
import { existsSync } from 'fs'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'

type Requester = {
  userId: string
}

export type FetchTaskProofResult = {
  absolutePath: string
  mimeType: string
}

@Injectable()
export class FetchTaskProofService {
  constructor(private tasksRepository: TasksRepository) {}

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

    const absolutePath = join(
      process.cwd(),
      'src',
      'tmp',
      task.proofImageUrl,
    )

    if (!existsSync(absolutePath)) {
      throw new AppException(errorDictionary.tasks.taskNotFound)
    }

    return {
      absolutePath,
      mimeType: mimeTypeFromPath(task.proofImageUrl),
    }
  }
}

function mimeTypeFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  return 'image/jpeg'
}
