import { CreateTaskService } from './create-task.service'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { OwnerUnavailableError } from 'src/common/owner-lock'
import { AppException } from 'src/exception/app.exception'
import { SaveCardService } from 'src/modules/cards/use-cases/save-card.service'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'

import type { CreateTaskData } from '../types'

type TasksRepositoryMock = jest.Mocked<Pick<TasksRepository, 'createTask'>>
type SaveCardServiceMock = jest.Mocked<Pick<SaveCardService, 'execute'>>
type FetchUserCardServiceMock = jest.Mocked<
  Pick<FetchUserCardService, 'execute'>
>
type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

const makeInput = (
  overrides: Partial<CreateTaskData> = {},
): CreateTaskData => ({
  state: 'SP',
  userId: 'user-1',
  offeredPrice: 100,
  city: 'São Paulo',
  locationLat: -23.55,
  locationLng: -46.63,
  street: 'Rua A, 123',
  zipCode: '01000-000',
  title: 'Comprar mantimentos',
  description: 'Ir ao mercado',
  savedCard: 'pm_owner',
  ...overrides,
})

describe('CreateTaskService', () => {
  let service: CreateTaskService
  let tasksRepository: TasksRepositoryMock
  let saveCardService: SaveCardServiceMock
  let fetchUserCardService: FetchUserCardServiceMock
  let fetchUserDetailsService: FetchUserDetailsServiceMock

  beforeEach(() => {
    tasksRepository = {
      createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
    }
    saveCardService = { execute: jest.fn() }
    fetchUserCardService = {
      execute: jest.fn().mockResolvedValue({ stripeCardId: 'pm_owner' }),
    }
    fetchUserDetailsService = {
      execute: jest.fn().mockResolvedValue({ userType: 'CLIENT' }),
    }

    service = new CreateTaskService(
      tasksRepository as unknown as TasksRepository,
      saveCardService as unknown as SaveCardService,
      fetchUserCardService as unknown as FetchUserCardService,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
    )
  })

  it('checks the user, then the card, then creates the task', async () => {
    await service.execute(makeInput())

    const user = fetchUserDetailsService.execute.mock.invocationCallOrder[0]
    const card = fetchUserCardService.execute.mock.invocationCallOrder[0]
    const create = tasksRepository.createTask.mock.invocationCallOrder[0]
    expect(user).toBeLessThan(card)
    expect(card).toBeLessThan(create)
  })

  it('composes locationAddress from street, city, state and zipCode', async () => {
    await service.execute(makeInput())

    expect(tasksRepository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        locationAddress: 'Rua A, 123, São Paulo - SP, 01000-000',
      }),
    )
  })

  it('persists the D1 fee breakdown and never platformNet', async () => {
    await service.execute(makeInput())

    const arg = tasksRepository.createTask.mock.calls[0][0]
    expect(arg.offeredPrice.toFixed(2)).toBe('100.00')
    expect(arg.platformFee.toFixed(2)).toBe('20.00')
    expect(arg.chargedAmount.toFixed(2)).toBe('100.00')
    expect(arg.proxyEarnings.toFixed(2)).toBe('80.00')
    expect(arg.stripeFee.toFixed(2)).toBe('4.38')
    expect(arg).not.toHaveProperty('platformNet')
  })

  it('rejects a PROXY with USER_NOT_CLIENT without creating the task', async () => {
    fetchUserDetailsService.execute.mockResolvedValue({
      userType: 'PROXY',
    } as never)

    await expect(service.execute(makeInput())).rejects.toMatchObject({
      response: expect.objectContaining({ errorCode: 'USER_NOT_CLIENT' }),
    })
    expect(tasksRepository.createTask).not.toHaveBeenCalled()
    expect(fetchUserCardService.execute).not.toHaveBeenCalled()
  })

  it('rejects a savedCard that is not the active card', async () => {
    await expect(
      service.execute(makeInput({ savedCard: 'pm_other' })),
    ).rejects.toBeInstanceOf(AppException)
    expect(tasksRepository.createTask).not.toHaveBeenCalled()
  })

  it('saves the card through saveCardService when a paymentMethodId is provided', async () => {
    await service.execute(
      makeInput({ savedCard: undefined, paymentMethodId: 'pm_new' }),
    )

    expect(saveCardService.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      paymentMethodId: 'pm_new',
    })
    expect(fetchUserCardService.execute).not.toHaveBeenCalled()
    expect(tasksRepository.createTask).toHaveBeenCalledTimes(1)
  })

  it('returns the id of the created task', async () => {
    const result = await service.execute(makeInput())

    expect(result).toEqual({ id: 'task-1' })
  })

  it('maps a deleted owner (raised by the repository) to user.notFound', async () => {
    tasksRepository.createTask.mockRejectedValue(new OwnerUnavailableError())

    await expect(service.execute(makeInput())).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })
  })
})
