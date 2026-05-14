import { Injectable } from '@nestjs/common'

import { TasksRepository } from '../repository/tasks.repository'

import type { FetchTasksResult } from '../types'

@Injectable()
export class FetchActiveTasksService {
  constructor(private tasksRepository: TasksRepository) {}

  async execute(userId: string): Promise<FetchTasksResult[]> {
    return this.tasksRepository.fetchActiveTasksForUser(userId)
  }
}
