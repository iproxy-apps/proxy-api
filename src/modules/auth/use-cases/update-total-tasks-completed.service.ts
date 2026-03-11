import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'

type UpdateTotalTasksCompletedRequest = {
  id: string
  tasksCompleted: number
}

@Injectable()
export class UpdateTotalTasksCompletedService {
  constructor(private authRepository: AuthRepository) {}

  async execute(data: UpdateTotalTasksCompletedRequest): Promise<void> {
    const { id, tasksCompleted } = data

    const user = await this.authRepository.fetchUserDetailsById(id)

    if (!user) {
      throw new AppException(errorDictionary.user.notFound)
    }

    await this.authRepository.updateTotalTasksCompleted(id, tasksCompleted)
  }
}
