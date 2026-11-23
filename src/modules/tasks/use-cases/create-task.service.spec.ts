import { CreateTaskService } from './create-task.service'
import { TasksRepository } from '../repository/tasks.repository'
import { SaveCardService } from 'src/modules/cards/use-cases/save-card.service'
import { UpdateTotalTasksCreatedService } from 'src/modules/auth/use-cases/update-total-tasks-created.service'

import type { CreateTaskData } from '../types'

type TasksRepositoryMock = jest.Mocked<Pick<TasksRepository, 'create'>>

type SaveCardServiceMock = jest.Mocked<Pick<SaveCardService, 'execute'>>

type UpdateTotalTasksCreatedServiceMock = jest.Mocked<
  Pick<UpdateTotalTasksCreatedService, 'execute'>
>

const makeInput = (
  overrides: Partial<CreateTaskData> = {},
): CreateTaskData => ({
  state: 'SP',
  userId: 'user-1',
  offeredPrice: 50,
  city: 'São Paulo',
  locationLat: -23.55,
  locationLng: -46.63,
  street: 'Rua A, 123',
  zipCode: '01000-000',
  title: 'Comprar mantimentos',
  description: 'Ir ao mercado',
  ...overrides,
})

describe('CreateTaskService', () => {
  let service: CreateTaskService
  let tasksRepository: TasksRepositoryMock
  let saveCardService: SaveCardServiceMock
  let updateTotalTasksCreatedService: UpdateTotalTasksCreatedServiceMock

  beforeEach(() => {
    tasksRepository = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'task-1' } as Awaited<
          ReturnType<TasksRepository['create']>
        >),
    }
    saveCardService = { execute: jest.fn() }
    updateTotalTasksCreatedService = { execute: jest.fn() }

    service = new CreateTaskService(
      tasksRepository as unknown as TasksRepository,
      saveCardService as unknown as SaveCardService,
      updateTotalTasksCreatedService as unknown as UpdateTotalTasksCreatedService,
    )
  })

  it('composes locationAddress from street, city, state and zipCode', async () => {
    await service.execute(makeInput())

    expect(tasksRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locationAddress: 'Rua A, 123, São Paulo - SP, 01000-000',
      }),
    )
  })

  it('persists the task with the provided fields', async () => {
    await service.execute(makeInput())

    expect(tasksRepository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      offeredPrice: 50,
      locationLat: -23.55,
      locationLng: -46.63,
      title: 'Comprar mantimentos',
      description: 'Ir ao mercado',
      locationAddress: 'Rua A, 123, São Paulo - SP, 01000-000',
    })
  })

  it('saves the card through saveCardService when a token is provided', async () => {
    await service.execute(makeInput({ token: 'tok_123', savedCard: 'pm_456' }))

    expect(saveCardService.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      paymentMethodId: 'tok_123',
    })
  })

  it('increments the user total tasks created counter', async () => {
    await service.execute(makeInput())

    expect(updateTotalTasksCreatedService.execute).toHaveBeenCalledWith({
      id: 'user-1',
      tasksCreated: 1,
    })
  })

  it('returns the id of the created task', async () => {
    const result = await service.execute(makeInput())

    expect(result).toEqual({ id: 'task-1' })
  })
})
