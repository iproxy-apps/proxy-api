import { Injectable } from '@nestjs/common'

import { TasksRepository } from '../repository/tasks.repository'

import type { FetchTasksData, FetchTasksResult } from '../types'

@Injectable()
export class FetchTasksService {
  constructor(private tasksRepository: TasksRepository) {}

  async execute(data: FetchTasksData): Promise<FetchTasksResult[]> {
    const { page, city } = data

    const perPage = 10
    const skip = (page - 1) * perPage
    const tasks = await this.tasksRepository.fetchAllTasks({
      perPage,
      skip,
      city,
    })

    return tasks
  }
}
