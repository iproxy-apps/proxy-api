import { Injectable } from '@nestjs/common'

import { matchServedCity } from 'src/common/served-cities'
import { toTaskResponse } from '../utils/task-response'
import { TasksRepository } from '../repository/tasks.repository'

import type { FetchTasksData, FetchTasksResponse } from '../types'

export const TASKS_PER_PAGE = 10

@Injectable()
export class FetchTasksService {
  constructor(private tasksRepository: TasksRepository) {}

  async execute(data: FetchTasksData): Promise<FetchTasksResponse> {
    const { page, city } = data

    const served = matchServedCity(city)
    if (!served) {
      return { items: [], page, perPage: TASKS_PER_PAGE, hasMore: false }
    }

    const rows = await this.tasksRepository.fetchAllTasks({
      city: served.city,
      skip: (page - 1) * TASKS_PER_PAGE,
      take: TASKS_PER_PAGE + 1,
    })

    return {
      items: rows.slice(0, TASKS_PER_PAGE).map(toTaskResponse),
      page,
      perPage: TASKS_PER_PAGE,
      hasMore: rows.length > TASKS_PER_PAGE,
    }
  }
}
