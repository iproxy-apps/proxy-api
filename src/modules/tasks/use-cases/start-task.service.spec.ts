import { Prisma } from '@prisma/client'
import { StartTaskService } from './start-task.service'
import { StripeService } from 'src/stripe/stripe.service'
import { AppException } from 'src/exception/app.exception'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'
import { TasksRepository } from '../repository/tasks.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { makeUser } from 'src/modules/auth/test-utils/user.factory'
import { NotificationService } from 'src/notification/notification.service'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'

import type { PaymentRecord } from 'src/modules/payments/types'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    | 'fetchTaskById'
    | 'fetchTaskMappingByTaskId'
    | 'claimTask'
    | 'fetchClaim'
    | 'releaseClaim'
    | 'flagCardActionRequired'
  >
>
type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchLatestByTaskId' | 'recordSucceededCharge'>
>
type StripeServiceMock = jest.Mocked<Pick<StripeService, 'chargeSavedCard'>>
type FetchUserCardServiceMock = jest.Mocked<
  Pick<FetchUserCardService, 'execute'>
>
type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>
type NotificationServiceMock = jest.Mocked<
  Pick<NotificationService, 'sendCardChargeFailedEmail'>
>

const makeTaskWithOwner = (
  overrides: Parameters<typeof makeTaskDetails>[0] = {},
) =>
  makeTaskDetails({
    owner: 'client-1',
    offeredPrice: new Prisma.Decimal(100),
    ownerId: {
      rating: new Prisma.Decimal(5),
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
    ...overrides,
  })

const makeReadyProxy = () =>
  makeUser({ userType: 'PROXY', stripeAccountReady: true })

const stripeError = (type: string) => Object.assign(new Error(type), { type })

describe('StartTaskService', () => {
  let service: StartTaskService
  let stripeService: StripeServiceMock
  let tasksRepository: TasksRepositoryMock
  let paymentsRepository: PaymentsRepositoryMock
  let fetchUserCardService: FetchUserCardServiceMock
  let fetchUserDetailsService: FetchUserDetailsServiceMock
  let notificationService: NotificationServiceMock

  const args = { taskId: 'task-1', userId: 'proxy-1' }

  beforeEach(() => {
    stripeService = { chargeSavedCard: jest.fn() }
    tasksRepository = {
      fetchTaskById: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
      claimTask: jest.fn(),
      fetchClaim: jest.fn(),
      releaseClaim: jest.fn(),
      flagCardActionRequired: jest.fn(),
    }
    paymentsRepository = {
      fetchLatestByTaskId: jest.fn(),
      recordSucceededCharge: jest.fn(),
    }
    fetchUserCardService = { execute: jest.fn() }
    fetchUserDetailsService = { execute: jest.fn() }
    notificationService = {
      sendCardChargeFailedEmail: jest.fn().mockResolvedValue(undefined),
    }

    service = new StartTaskService(
      stripeService as unknown as StripeService,
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
      fetchUserCardService as unknown as FetchUserCardService,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
      notificationService as unknown as NotificationService,
    )
  })

  const happyPath = () => {
    tasksRepository.fetchTaskById.mockResolvedValue(makeTaskWithOwner())
    fetchUserDetailsService.execute.mockResolvedValue(makeReadyProxy())
    fetchUserCardService.execute.mockResolvedValue({
      stripeCardId: 'pm_owner',
    } as unknown as Awaited<ReturnType<FetchUserCardService['execute']>>)
    tasksRepository.claimTask.mockResolvedValue(true)
    stripeService.chargeSavedCard.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: 'ch_1',
    } as unknown as Awaited<ReturnType<StripeService['chargeSavedCard']>>)
    paymentsRepository.recordSucceededCharge.mockResolvedValue({
      taskId: 'task-1',
    } as PaymentRecord)
  }

  const expectCode = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject({ errorCode: code })
  }

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expectCode(
      service.execute(args),
      errorDictionary.tasks.taskNotFound.errorCode,
    )
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
  })

  it('throws taskNotAvailable when the task is neither available nor in progress', async () => {
    happyPath()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ status: 'completed' }),
    )

    await expectCode(
      service.execute(args),
      errorDictionary.tasks.taskNotAvailable.errorCode,
    )
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('throws taskNotAvailable when the task is in progress for another proxy', async () => {
    happyPath()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'proxy-2' }),
    )

    await expectCode(
      service.execute(args),
      errorDictionary.tasks.taskNotAvailable.errorCode,
    )
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('throws cannotStartOwnTask when the executor owns the task', async () => {
    happyPath()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ owner: 'proxy-1' }),
    )

    await expectCode(
      service.execute(args),
      errorDictionary.tasks.cannotStartOwnTask.errorCode,
    )
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
  })

  it('throws userNotProxy when the user is not a PROXY or is not onboarded', async () => {
    happyPath()
    fetchUserDetailsService.execute.mockResolvedValue(
      makeUser({ userType: 'CLIENT' }),
    )
    await expectCode(
      service.execute(args),
      errorDictionary.user.userNotProxy.errorCode,
    )

    fetchUserDetailsService.execute.mockResolvedValue(
      makeUser({ userType: 'PROXY', stripeAccountReady: false }),
    )
    await expectCode(
      service.execute(args),
      errorDictionary.user.userNotProxy.errorCode,
    )
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
  })

  it('flags the owner, notifies and answers paymentFailed without claiming when there is no saved card', async () => {
    happyPath()
    fetchUserCardService.execute.mockRejectedValue(
      new AppException(errorDictionary.card.noSavedCardFound),
    )

    await expectCode(
      service.execute(args),
      errorDictionary.payment.paymentFailed.errorCode,
    )

    expect(tasksRepository.flagCardActionRequired).toHaveBeenCalledWith(
      'client-1',
    )
    expect(notificationService.sendCardChargeFailedEmail).toHaveBeenCalledTimes(
      1,
    )
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('does not claim or charge when the card lookup throws something else', async () => {
    happyPath()
    fetchUserCardService.execute.mockRejectedValue(new Error('db down'))

    await expect(service.execute(args)).rejects.toThrow('db down')
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('does not claim or charge when the owner has no Stripe customer', async () => {
    happyPath()
    const task = makeTaskWithOwner()
    task.ownerId.stripeCustomerId = null
    tasksRepository.fetchTaskById.mockResolvedValue(task)

    await expectCode(
      service.execute(args),
      errorDictionary.payment.paymentFailed.errorCode,
    )
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('claims, then charges, then records the payment, in that order', async () => {
    happyPath()

    await expect(service.execute(args)).resolves.toEqual({
      status: 'succeeded',
    })

    const claimOrder = tasksRepository.claimTask.mock.invocationCallOrder[0]
    const chargeOrder =
      stripeService.chargeSavedCard.mock.invocationCallOrder[0]
    const recordOrder =
      paymentsRepository.recordSucceededCharge.mock.invocationCallOrder[0]
    expect(claimOrder).toBeLessThan(chargeOrder)
    expect(chargeOrder).toBeLessThan(recordOrder)

    const { startedAt } = tasksRepository.claimTask.mock.calls[0][0]
    expect(stripeService.chargeSavedCard).toHaveBeenCalledWith(
      {
        amount: 10000,
        customer: 'cus_owner',
        paymentMethod: 'pm_owner',
        taskId: 'task-1',
        proxyId: 'proxy-1',
        claimedAt: startedAt.toISOString(),
      },
      `start:task-1:proxy-1:${startedAt.getTime()}`,
    )
    expect(paymentsRepository.recordSucceededCharge).toHaveBeenCalledWith({
      taskId: 'task-1',
      paymentIntent: 'pi_1',
      amount: new Prisma.Decimal(100),
      chargeId: 'ch_1',
    })
    expect(tasksRepository.releaseClaim).not.toHaveBeenCalled()
  })

  it('charges chargedAmount when the task stores it', async () => {
    happyPath()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ chargedAmount: new Prisma.Decimal('20.01') }),
    )

    await service.execute(args)

    expect(stripeService.chargeSavedCard.mock.calls[0][0].amount).toBe(2001)
  })

  it('does not call Stripe when the CAS is lost and the mapping belongs to another proxy', async () => {
    happyPath()
    tasksRepository.claimTask.mockResolvedValue(false)
    tasksRepository.fetchClaim.mockResolvedValue({
      status: 'in_progress',
      startedAt: new Date(),
      executorId: 'proxy-2',
    })

    await expectCode(
      service.execute(args),
      errorDictionary.tasks.taskNotAvailable.errorCode,
    )
    expect(tasksRepository.claimTask.mock.invocationCallOrder[0]).toBeLessThan(
      tasksRepository.fetchClaim.mock.invocationCallOrder[0],
    )
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('replays succeeded without charging when this proxy already started the task', async () => {
    happyPath()
    const startedAt = new Date()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ status: 'in_progress', startedAt }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'proxy-1' }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue({
      status: 'succeeded',
    } as PaymentRecord)

    await expect(service.execute(args)).resolves.toEqual({
      status: 'succeeded',
    })
    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
    expect(fetchUserCardService.execute).not.toHaveBeenCalled()
  })

  it('answers chargePending and keeps the claim when this proxy holds the claim and the owner card is gone', async () => {
    happyPath()
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ status: 'in_progress', startedAt: new Date() }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'proxy-1' }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(null)
    fetchUserCardService.execute.mockRejectedValue(
      new AppException(errorDictionary.card.noSavedCardFound),
    )

    await expectCode(
      service.execute(args),
      errorDictionary.payment.chargePending.errorCode,
    )
    expect(tasksRepository.flagCardActionRequired).not.toHaveBeenCalled()
    expect(tasksRepository.releaseClaim).not.toHaveBeenCalled()
    expect(notificationService.sendCardChargeFailedEmail).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).not.toHaveBeenCalled()
  })

  it('passes the charge id when latest_charge is an expanded object', async () => {
    happyPath()
    stripeService.chargeSavedCard.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      latest_charge: { id: 'ch_obj' },
    } as unknown as Awaited<ReturnType<StripeService['chargeSavedCard']>>)

    await service.execute(args)

    expect(paymentsRepository.recordSucceededCharge).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: 'ch_obj' }),
    )
  })

  it('resumes the same claim with the same key when the proxy retries an in-progress task', async () => {
    happyPath()
    const startedAt = new Date('2026-01-01T10:00:00.000Z')
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskWithOwner({ status: 'in_progress', startedAt }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping({ executorId: 'proxy-1' }),
    )
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(null)
    tasksRepository.fetchClaim.mockResolvedValue({
      status: 'in_progress',
      startedAt,
      executorId: 'proxy-1',
    })

    await service.execute(args)

    expect(tasksRepository.claimTask).not.toHaveBeenCalled()
    expect(stripeService.chargeSavedCard).toHaveBeenCalledWith(
      expect.objectContaining({ claimedAt: startedAt.toISOString() }),
      `start:task-1:proxy-1:${startedAt.getTime()}`,
    )
  })

  it.each(['StripeCardError', 'StripeInvalidRequestError'])(
    'releases the claim with the owner flag, notifies and answers paymentFailed on %s',
    async (type) => {
      happyPath()
      stripeService.chargeSavedCard.mockRejectedValue(stripeError(type))

      await expectCode(
        service.execute(args),
        errorDictionary.payment.paymentFailed.errorCode,
      )

      const { startedAt } = tasksRepository.claimTask.mock.calls[0][0]
      expect(tasksRepository.releaseClaim).toHaveBeenCalledWith({
        taskId: 'task-1',
        executorId: 'proxy-1',
        startedAt,
        cardActionOwnerId: 'client-1',
      })
      expect(
        notificationService.sendCardChargeFailedEmail,
      ).toHaveBeenCalledWith('owner@test.io', 'Owner', 'title')
      expect(paymentsRepository.recordSucceededCharge).not.toHaveBeenCalled()
    },
  )

  it('treats requires_action as a definite failure', async () => {
    happyPath()
    stripeService.chargeSavedCard.mockResolvedValue({
      id: 'pi_3ds',
      status: 'requires_action',
    } as unknown as Awaited<ReturnType<StripeService['chargeSavedCard']>>)

    await expectCode(
      service.execute(args),
      errorDictionary.payment.paymentFailed.errorCode,
    )

    expect(tasksRepository.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ cardActionOwnerId: 'client-1' }),
    )
    expect(paymentsRepository.recordSucceededCharge).not.toHaveBeenCalled()
  })

  it.each(['StripeConnectionError', 'StripeIdempotencyError'])(
    'keeps the claim, stays silent and answers chargePending on %s',
    async (type) => {
      happyPath()
      stripeService.chargeSavedCard.mockRejectedValue(stripeError(type))

      await expectCode(
        service.execute(args),
        errorDictionary.payment.chargePending.errorCode,
      )

      expect(tasksRepository.releaseClaim).not.toHaveBeenCalled()
      expect(
        notificationService.sendCardChargeFailedEmail,
      ).not.toHaveBeenCalled()
      expect(paymentsRepository.recordSucceededCharge).not.toHaveBeenCalled()
    },
  )

  it('keeps the claim and answers chargePending on a processing outcome', async () => {
    happyPath()
    stripeService.chargeSavedCard.mockResolvedValue({
      id: 'pi_proc',
      status: 'processing',
    } as unknown as Awaited<ReturnType<StripeService['chargeSavedCard']>>)

    await expectCode(
      service.execute(args),
      errorDictionary.payment.chargePending.errorCode,
    )

    expect(tasksRepository.releaseClaim).not.toHaveBeenCalled()
    expect(notificationService.sendCardChargeFailedEmail).not.toHaveBeenCalled()
  })

  it('still answers paymentFailed when the notification e-mail rejects', async () => {
    happyPath()
    stripeService.chargeSavedCard.mockRejectedValue(
      stripeError('StripeCardError'),
    )
    notificationService.sendCardChargeFailedEmail.mockRejectedValue(
      new Error('ses down'),
    )

    await expectCode(
      service.execute(args),
      errorDictionary.payment.paymentFailed.errorCode,
    )
    expect(tasksRepository.releaseClaim).toHaveBeenCalledTimes(1)
  })

  it('still answers succeeded when the recorded payment belongs to another task', async () => {
    happyPath()
    paymentsRepository.recordSucceededCharge.mockResolvedValue({
      taskId: 'other-task',
    } as PaymentRecord)

    await expect(service.execute(args)).resolves.toEqual({
      status: 'succeeded',
    })
  })
})
