import { StartTaskService } from './start-task.service'
import { StripeService } from 'src/stripe/stripe.service'
import { makeTaskDetails } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { makeUser } from 'src/modules/auth/test-utils/user.factory'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'
import { CreatePaymentRecordService } from 'src/modules/payments/use-cases/create-payment-record.service'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    'fetchTaskById' | 'updateTaskStatus' | 'insertTaskUserMapping'
  >
>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'createPaymentIntent' | 'confirmPaymentIntent'>
>

type FetchUserCardServiceMock = jest.Mocked<
  Pick<FetchUserCardService, 'execute'>
>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

type CreatePaymentRecordServiceMock = jest.Mocked<
  Pick<CreatePaymentRecordService, 'execute'>
>

const makeTaskWithOwner = () =>
  makeTaskDetails({
    owner: 'client-1',
    offeredPrice: 100,
    ownerId: {
      rating: 5,
      name: 'Owner',
      id: 'client-1',
      avatarUrl: null,
      isVerified: true,
      phoneNumber: null,
      totalTasksCreated: 0,
      email: 'owner@test.io',
      totalTasksCompleted: 0,
      stripeCustomerId: 'cus_owner',
    },
  })

const makeReadyProxy = () =>
  makeUser({ userType: 'PROXY', stripeAccountReady: true })

describe('StartTaskService', () => {
  let service: StartTaskService
  let stripeService: StripeServiceMock
  let tasksRepository: TasksRepositoryMock
  let fetchUserCardService: FetchUserCardServiceMock
  let fetchUserDetailsService: FetchUserDetailsServiceMock
  let createPaymentRecordService: CreatePaymentRecordServiceMock

  beforeEach(() => {
    stripeService = {
      createPaymentIntent: jest.fn(),
      confirmPaymentIntent: jest.fn(),
    }
    tasksRepository = {
      fetchTaskById: jest.fn(),
      updateTaskStatus: jest.fn(),
      insertTaskUserMapping: jest.fn(),
    }
    fetchUserCardService = { execute: jest.fn() }
    fetchUserDetailsService = { execute: jest.fn() }
    createPaymentRecordService = { execute: jest.fn() }

    service = new StartTaskService(
      stripeService as unknown as StripeService,
      tasksRepository as unknown as TasksRepository,
      fetchUserCardService as unknown as FetchUserCardService,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
      createPaymentRecordService as unknown as CreatePaymentRecordService,
    )
  })

  const mockOwnerCard = () =>
    fetchUserCardService.execute.mockResolvedValue({
      stripeCardId: 'pm_owner',
    } as unknown as Awaited<ReturnType<FetchUserCardService['execute']>>)

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
    expect(tasksRepository.insertTaskUserMapping).not.toHaveBeenCalled()
  })

  it('throws cannotStartOwnTask when the executor is the task owner', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ owner: 'proxy-1' }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotStartOwnTask.errorCode,
    })

    expect(fetchUserDetailsService.execute).not.toHaveBeenCalled()
    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws userNotProxy when the caller is not a PROXY', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(
      makeUser({ userType: 'CLIENT' }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.userNotProxy.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('throws userNotProxy when the PROXY has not completed Stripe onboarding', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(
      makeUser({ userType: 'PROXY', stripeAccountReady: false }),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.userNotProxy.errorCode,
    })

    expect(tasksRepository.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('creates a pending payment record BEFORE confirming and returns succeeded on happy path', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(makeReadyProxy())
    mockOwnerCard()
    stripeService.createPaymentIntent.mockResolvedValue({
      id: 'pi_123',
    } as Awaited<ReturnType<StripeService['createPaymentIntent']>>)
    stripeService.confirmPaymentIntent.mockResolvedValue({
      id: 'pi_123',
      status: 'succeeded',
    } as Awaited<ReturnType<StripeService['confirmPaymentIntent']>>)

    const result = await service.execute({ taskId: 'task-1', userId: 'proxy-1' })

    expect(result).toEqual({ status: 'succeeded' })

    // payment record is created before the confirmation call
    const createPaymentOrder =
      createPaymentRecordService.execute.mock.invocationCallOrder[0]
    const confirmOrder =
      stripeService.confirmPaymentIntent.mock.invocationCallOrder[0]
    expect(createPaymentOrder).toBeLessThan(confirmOrder)

    expect(createPaymentRecordService.execute).toHaveBeenCalledWith({
      taskId: 'task-1',
      amount: 100,
      paymentIntent: 'pi_123',
    })
  })

  it('returns requires_action with client_secret when 3DS is needed', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(makeReadyProxy())
    mockOwnerCard()
    stripeService.createPaymentIntent.mockResolvedValue({
      id: 'pi_3ds',
    } as Awaited<ReturnType<StripeService['createPaymentIntent']>>)
    stripeService.confirmPaymentIntent.mockResolvedValue({
      id: 'pi_3ds',
      status: 'requires_action',
      client_secret: 'pi_3ds_secret_abc',
    } as Awaited<ReturnType<StripeService['confirmPaymentIntent']>>)

    const result = await service.execute({ taskId: 'task-1', userId: 'proxy-1' })

    expect(result).toEqual({
      status: 'requires_action',
      clientSecret: 'pi_3ds_secret_abc',
    })
    // payment record was still created as pending so webhooks can update it later
    expect(createPaymentRecordService.execute).toHaveBeenCalledTimes(1)
  })

  it('throws paymentFailed when payment intent creation returns no id', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(makeReadyProxy())
    mockOwnerCard()
    stripeService.createPaymentIntent.mockResolvedValue(
      {} as Awaited<ReturnType<StripeService['createPaymentIntent']>>,
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.payment.paymentFailed.errorCode,
    })

    expect(createPaymentRecordService.execute).not.toHaveBeenCalled()
    expect(stripeService.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  it('throws paymentFailed when confirmation status is not succeeded nor requires_action', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(makeReadyProxy())
    mockOwnerCard()
    stripeService.createPaymentIntent.mockResolvedValue({
      id: 'pi_123',
    } as Awaited<ReturnType<StripeService['createPaymentIntent']>>)
    stripeService.confirmPaymentIntent.mockResolvedValue({
      id: 'pi_123',
      status: 'requires_payment_method',
    } as Awaited<ReturnType<StripeService['confirmPaymentIntent']>>)

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.payment.paymentFailed.errorCode,
    })
  })

  it('throws paymentFailed when Stripe throws during payment intent creation', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(makeReadyProxy())
    mockOwnerCard()
    stripeService.createPaymentIntent.mockRejectedValue(
      new Error('stripe down'),
    )

    await expect(
      service.execute({ taskId: 'task-1', userId: 'proxy-1' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.payment.paymentFailed.errorCode,
    })

    expect(createPaymentRecordService.execute).not.toHaveBeenCalled()
  })
})
