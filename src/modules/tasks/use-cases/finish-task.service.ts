import { join } from 'path'
import { Injectable } from '@nestjs/common'
import { mkdirSync, writeFileSync } from 'fs'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { imageExtensionFromMime } from 'src/pipes/multer-validation.pipe'

import type { FinishTaskData } from '../types'

@Injectable()
export class FinishTaskService {
  constructor(private tasksRepository: TasksRepository) {}

  async execute(data: FinishTaskData): Promise<void> {
    const { taskId, userId, file } = data

    const taskDetails = await this.tasksRepository.fetchTaskById({
      taskId,
      status: 'in_progress',
    })

    // validations
    if (!taskDetails) throw new AppException(errorDictionary.tasks.taskNotFound)
    if (taskDetails.status !== 'in_progress') {
      throw new AppException(errorDictionary.tasks.taskNotAvailable)
    }

    const taskMapping =
      await this.tasksRepository.fetchTaskMappingByTaskId(taskId)

    if (!taskMapping) {
      throw new AppException(errorDictionary.tasks.taskMappingNotFound)
    }

    if (taskMapping.executorId !== userId) {
      throw new AppException(errorDictionary.tasks.cannotFinishTask)
    }

    // NOTE: there is no time-based cutoff on finishing a task. The 1h grace
    // window only applies to the client's *cancel* action, which protects
    // the pre-authorized payment; the proxy's *finish* action is bounded
    // only by the `in_progress` status guard above.

    // save file to disk only after all validations pass
    let filePath: string | null = null

    if (file) {
      const ext = imageExtensionFromMime(file.mimetype)
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
      const filename = `${unique}${ext}`

      const baseTmpPath = join(process.cwd(), 'src', 'tmp')
      const taskFolderPath = join(baseTmpPath, taskId)

      mkdirSync(taskFolderPath, { recursive: true })
      writeFileSync(join(taskFolderPath, filename), file.buffer)

      filePath = `${taskId}/${filename}`
    }

    // mark as awaiting client validation; completedAt records when the proxy finished
    await this.tasksRepository.updateTaskStatus({
      taskId,
      filePath,
      completedAt: new Date(),
      status: 'verification_required',
    })
  }
}
