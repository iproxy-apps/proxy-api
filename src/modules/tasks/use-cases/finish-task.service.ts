import { join } from 'path'
import { Injectable } from '@nestjs/common'
import { differenceInHours } from 'date-fns'
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

    // validate if task started at date is greater than 1 hour
    const isGreaterThanOneHour = differenceInHours(new Date(), taskDetails.startedAt as Date) >= 1 // prettier-ignore
    if (isGreaterThanOneHour) {
      throw new AppException(errorDictionary.tasks.taskStartedAtNotValid)
    }

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

    // set task as verification required
    await this.tasksRepository.updateTaskStatus({
      taskId,
      filePath,
      completedAt: new Date(),
      status: 'verification_required',
    })
  }
}
