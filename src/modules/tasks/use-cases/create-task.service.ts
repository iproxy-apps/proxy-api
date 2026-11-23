import { Injectable } from '@nestjs/common'

import { TasksRepository } from '../repository/tasks.repository'
import { SaveCardService } from 'src/modules/cards/use-cases/save-card.service'
import { UpdateTotalTasksCreatedService } from 'src/modules/auth/use-cases/update-total-tasks-created.service'

import type { CreateTaskData } from '../types'

@Injectable()
export class CreateTaskService {
  constructor(
    private tasksRepository: TasksRepository,
    private saveCardService: SaveCardService,
    private updateTotalTasksCreatedService: UpdateTotalTasksCreatedService,
  ) {}

  async execute(data: CreateTaskData): Promise<{ id: string }> {
    const {
      city,
      title,
      state,
      userId,
      street,
      zipCode,
      description,
      locationLat,
      locationLng,
      offeredPrice,

      token,
    } = data

    const locationAddress = `${street}, ${city} - ${state}, ${zipCode}`

    const task = await this.tasksRepository.create({
      title,
      userId,
      description,
      locationLat,
      locationLng,
      offeredPrice,
      locationAddress,
    })

    // bridge until P1-T06 rewrites /tasks/create with the "card before insert" rule
    if (token) {
      await this.saveCardService.execute({ userId, paymentMethodId: token })
    }

    await this.updateTotalTasksCreatedService.execute({
      id: userId,
      tasksCreated: 1, // Increment by 1 for each created task
    })

    return { id: task.id }
  }
}
