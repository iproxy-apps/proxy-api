import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'

type UpdateTotalTasksCreatedRequest = {
  id: string
  tasksCreated: number
}

@Injectable()
export class UpdateTotalTasksCreatedService {
  constructor(private authRepository: AuthRepository) {}

  async execute(data: UpdateTotalTasksCreatedRequest): Promise<void> {
    const { id, tasksCreated } = data

    const user = await this.authRepository.fetchUserDetailsById(id)

    if (!user) {
      throw new AppException(errorDictionary.user.notFound)
    }

    await this.authRepository.updateTotalTasksCreated(id, tasksCreated)
  }
}
