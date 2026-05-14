import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'

@Injectable()
export class DeleteAccountService {
  constructor(
    private authRepository: AuthRepository,
    private tasksRepository: TasksRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.authRepository.fetchUserDetailsById(userId)
    if (!user || user.isDeleted) {
      throw new AppException(errorDictionary.user.notFound)
    }

    const activeTasks =
      await this.tasksRepository.fetchActiveTasksForUser(userId)
    if (activeTasks.length > 0) {
      throw new AppException(errorDictionary.user.cannotDeleteWithActiveTasks)
    }

    await this.authRepository.softDeleteUser(userId)
  }
}
