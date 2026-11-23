import { Injectable } from '@nestjs/common'

import { toTaskResponse } from '../utils/task-response'
import { TasksRepository } from '../repository/tasks.repository'

import type { TaskResponse } from '../types'

@Injectable()
export class FetchActiveTasksService {
  constructor(private tasksRepository: TasksRepository) {}

  async execute(userId: string): Promise<TaskResponse[]> {
    const rows = await this.tasksRepository.fetchActiveTasksForUser(userId)
    return rows.map(toTaskResponse)
  }
}
