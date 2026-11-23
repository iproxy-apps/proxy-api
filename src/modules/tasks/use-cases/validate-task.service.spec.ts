import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AppException } from 'src/exception/app.exception'
import { StripeService } from 'src/stripe/stripe.service'
import { ValidateTaskService } from './validate-task.service'
import { errorDictionary } from 'src/exception/error-dictionary'
import { TasksRepository } from '../repository/tasks.repository'
import { makeUser } from 'src/modules/auth/test-utils/user.factory'
import { makeTaskDetails, makeTaskMapping } from '../test-utils/task.factory'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { RateProxyService } from 'src/modules/ratings/use-cases/rate-proxy.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'

import type { PaymentRecord } from 'src/modules/payments/types'

type TasksRepositoryMock = jest.Mocked<
  Pick<
    TasksRepository,
    | 'fetchTaskById'
    | 'fetchTaskMappingByTaskId'
    | 'transition'
    | 'recordTransfer'
  >
>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'createTransferFromCharge' | 'findTransferByGroup'>
>

type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchLatestByTaskId'>
>

type RateProxyServiceMock = jest.Mocked<Pick<RateProxyService, 'execute'>>

type FetchUserDetailsServiceMock = jest.Mocked<
  Pick<FetchUserDetailsService, 'execute'>
>

const makeReadyProxy = () =>
  makeUser({
    id: 'proxy-1',
    userType: 'PROXY',
    stripeAccountId: 'acct_proxy_1',
    stripeAccountReady: true,
  })

const makePayment = (
  overrides: Partial<PaymentRecord> = {},
): PaymentRecord => ({
  id: 'pay-1',
  taskId: 'task-1',
  amount: 100 as unknown as PaymentRecord['amount'],
  status: 'succeeded',
  paymentIntent: 'pi_test_1',
  refundId: null,
  chargeId: 'ch_test_1',
  disputeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('ValidateTaskService', () => {
  let service: ValidateTaskService
  let stripeService: StripeServiceMock
  let tasksRepository: TasksRepositoryMock
  let paymentsRepository: PaymentsRepositoryMock
  let rateProxyService: RateProxyServiceMock
  let fetchUserDetailsService: FetchUserDetailsServiceMock

  const execute = (extra: { rating?: number; comment?: string } = {}) =>
    service.execute({ taskId: 'task-1', userId: 'client-1', ...extra })

  const seedHappyPath = (price = 100) => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({
        offeredPrice: new Prisma.Decimal(price),
        status: 'verification_required',
      }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )
  }

  beforeEach(() => {
    tasksRepository = {
      fetchTaskById: jest.fn(),
      fetchTaskMappingByTaskId: jest.fn(),
      transition: jest.fn().mockResolvedValue(true),
      recordTransfer: jest.fn().mockResolvedValue(undefined),
    }
    stripeService = {
      findTransferByGroup: jest.fn().mockResolvedValue(null),
      createTransferFromCharge: jest
        .fn()
        .mockResolvedValue({ id: 'tr_test_1' }),
    }
    paymentsRepository = {
      fetchLatestByTaskId: jest.fn().mockResolvedValue(makePayment()),
    }
    rateProxyService = { execute: jest.fn() }
    fetchUserDetailsService = {
      execute: jest.fn().mockResolvedValue(makeReadyProxy()),
    }

    service = new ValidateTaskService(
      stripeService as unknown as StripeService,
      tasksRepository as unknown as TasksRepository,
      paymentsRepository as unknown as PaymentsRepository,
      rateProxyService as unknown as RateProxyService,
      fetchUserDetailsService as unknown as FetchUserDetailsService,
    )
  })

  it('throws taskNotFound when the task does not exist', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(null)

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.taskNotFound.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
  })

  it('throws statusConflict when the task is not in verification_required', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ owner: 'client-1', status: 'in_progress' }),
    )

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.statusConflict.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
  })

  it('throws cannotValidateTask when requester is not the task owner', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({
        owner: 'someone-else',
        status: 'verification_required',
      }),
    )

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.cannotValidateTask.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws taskMappingNotFound when there is no executor mapping', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({ status: 'verification_required' }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(null)

    await expect(execute()).rejects.toBeInstanceOf(AppException)

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws proxyAccountNotReady when the proxy cannot receive transfers', async () => {
    seedHappyPath()
    fetchUserDetailsService.execute.mockResolvedValue(
      makeUser({
        id: 'proxy-1',
        stripeAccountReady: false,
        stripeAccountId: null,
      }),
    )

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.proxyAccountNotReady.errorCode,
    })

    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it.each(['pending', 'failed', 'refunded'] as const)(
    'throws PAYMENT_NOT_CONFIRMED before any write when the payment is %s',
    async (status) => {
      seedHappyPath()
      paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
        makePayment({ status }),
      )

      await expect(execute()).rejects.toMatchObject({
        errorCode: errorDictionary.payment.notConfirmed.errorCode,
      })

      expect(tasksRepository.transition).not.toHaveBeenCalled()
      expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
    },
  )

  it('throws PAYMENT_NOT_CONFIRMED when there is no payment or no chargeId', async () => {
    seedHappyPath()
    paymentsRepository.fetchLatestByTaskId.mockResolvedValueOnce(null)
    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.notConfirmed.errorCode,
    })

    paymentsRepository.fetchLatestByTaskId.mockResolvedValueOnce(
      makePayment({ chargeId: null }),
    )
    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.notConfirmed.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
  })

  it('throws PAYMENT_DISPUTED before any write when the payment is disputed', async () => {
    seedHappyPath()
    paymentsRepository.fetchLatestByTaskId.mockResolvedValue(
      makePayment({ status: 'disputed', disputeId: 'dp_1' }),
    )

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.payment.disputed.errorCode,
    })

    expect(tasksRepository.transition).not.toHaveBeenCalled()
    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
  })

  it('throws TASK_STATUS_CONFLICT and does not transfer when the CAS loses', async () => {
    seedHappyPath()
    tasksRepository.transition.mockResolvedValue(false)

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.statusConflict.errorCode,
    })

    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
    expect(tasksRepository.recordTransfer).not.toHaveBeenCalled()
  })

  it('reverts to verification_required and throws transferFailed when the transfer rejects', async () => {
    seedHappyPath()
    stripeService.createTransferFromCharge.mockRejectedValue(
      new Error('stripe down'),
    )

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.transferFailed.errorCode,
    })

    expect(tasksRepository.transition).toHaveBeenNthCalledWith(1, {
      taskId: 'task-1',
      from: ['verification_required'],
      to: 'completed',
    })
    expect(tasksRepository.transition).toHaveBeenNthCalledWith(2, {
      taskId: 'task-1',
      from: ['completed'],
      to: 'verification_required',
    })
    expect(tasksRepository.recordTransfer).not.toHaveBeenCalled()
  })

  it('reverts when Stripe answers without a transfer id', async () => {
    seedHappyPath()
    stripeService.createTransferFromCharge.mockResolvedValue(
      undefined as unknown as Awaited<
        ReturnType<StripeService['createTransferFromCharge']>
      >,
    )

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.transferFailed.errorCode,
    })

    expect(tasksRepository.transition).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      from: ['completed'],
      to: 'verification_required',
    })
    expect(tasksRepository.recordTransfer).not.toHaveBeenCalled()
  })

  it('reuses an existing transfer of the group instead of creating one', async () => {
    seedHappyPath()
    stripeService.findTransferByGroup.mockResolvedValue({
      id: 'tr_existing',
    } as Awaited<ReturnType<StripeService['findTransferByGroup']>>)
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()

    await execute()

    expect(stripeService.findTransferByGroup).toHaveBeenCalledWith('task-1')
    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
    expect(tasksRepository.recordTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: 'tr_existing' }),
    )
    expect(warn).toHaveBeenCalledWith(
      'task task-1: reusing existing transfer tr_existing',
    )
    warn.mockRestore()
  })

  it.each([
    ['reversed', { reversed: true, amount_reversed: 0 }],
    ['partially reversed', { reversed: false, amount_reversed: 100 }],
  ])('refuses to reuse a %s transfer and reverts', async (_label, extra) => {
    seedHappyPath()
    stripeService.findTransferByGroup.mockResolvedValue({
      id: 'tr_rev',
      ...extra,
    } as Awaited<ReturnType<StripeService['findTransferByGroup']>>)
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.transferFailed.errorCode,
    })

    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
    expect(tasksRepository.recordTransfer).not.toHaveBeenCalled()
    expect(tasksRepository.transition).toHaveBeenNthCalledWith(2, {
      taskId: 'task-1',
      from: ['completed'],
      to: 'verification_required',
    })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('reverts and throws transferFailed when the transfer lookup throws', async () => {
    seedHappyPath()
    stripeService.findTransferByGroup.mockRejectedValue(new Error('list down'))

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.transferFailed.errorCode,
    })

    expect(stripeService.createTransferFromCharge).not.toHaveBeenCalled()
    expect(tasksRepository.transition).toHaveBeenNthCalledWith(2, {
      taskId: 'task-1',
      from: ['completed'],
      to: 'verification_required',
    })
    expect(tasksRepository.recordTransfer).not.toHaveBeenCalled()
  })

  it('claims the task before transferring 80 % from the charge and records the transfer', async () => {
    seedHappyPath(100)

    await execute()

    expect(tasksRepository.transition).toHaveBeenCalledTimes(1)
    expect(tasksRepository.transition.mock.invocationCallOrder[0]).toBeLessThan(
      stripeService.createTransferFromCharge.mock.invocationCallOrder[0],
    )
    expect(stripeService.createTransferFromCharge).toHaveBeenCalledWith(
      {
        amount: 8000,
        destination: 'acct_proxy_1',
        sourceTransaction: 'ch_test_1',
        transferGroup: 'task-1',
        taskId: 'task-1',
      },
      'task:task-1:transfer',
    )

    expect(tasksRepository.recordTransfer).toHaveBeenCalledTimes(1)
    const recorded = tasksRepository.recordTransfer.mock.calls[0][0]
    expect(recorded).toMatchObject({
      taskId: 'task-1',
      executorId: 'proxy-1',
      transferId: 'tr_test_1',
    })
    expect(recorded.proxyEarnings).toBeInstanceOf(Prisma.Decimal)
    expect(recorded.proxyEarnings.toFixed(2)).toBe('80.00')
  })

  it('prefers the stored proxyEarnings over recomputing', async () => {
    tasksRepository.fetchTaskById.mockResolvedValue(
      makeTaskDetails({
        offeredPrice: new Prisma.Decimal(100),
        status: 'verification_required',
        proxyEarnings: new Prisma.Decimal('80.00'),
      }),
    )
    tasksRepository.fetchTaskMappingByTaskId.mockResolvedValue(
      makeTaskMapping(),
    )

    await execute()

    expect(stripeService.createTransferFromCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 8000 }),
      'task:task-1:transfer',
    )
  })

  it('does not record a rating when none is provided', async () => {
    seedHappyPath()

    await execute()

    expect(rateProxyService.execute).not.toHaveBeenCalled()
  })

  it('records the rating for the executor when provided', async () => {
    seedHappyPath()

    await execute({ rating: 5, comment: 'ótimo' })

    expect(rateProxyService.execute).toHaveBeenCalledWith({
      taskId: 'task-1',
      raterId: 'client-1',
      ratedId: 'proxy-1',
      score: 5,
      comment: 'ótimo',
    })
  })

  it('still resolves when recording the rating fails after the payout', async () => {
    seedHappyPath()
    rateProxyService.execute.mockRejectedValue(new Error('db down'))

    await expect(execute({ rating: 4 })).resolves.toBeUndefined()

    expect(tasksRepository.recordTransfer).toHaveBeenCalledTimes(1)
  })

  it('logs and rethrows without reverting when recordTransfer fails after the payout', async () => {
    seedHappyPath()
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    tasksRepository.recordTransfer.mockRejectedValue(new Error('db down'))

    await expect(execute()).rejects.toThrow('db down')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('recordTransfer failed')
    expect(tasksRepository.transition).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('still answers transferFailed and logs twice when the revert itself throws', async () => {
    seedHappyPath()
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    stripeService.createTransferFromCharge.mockRejectedValue(
      new Error('stripe down'),
    )
    tasksRepository.transition
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('revert down'))

    await expect(execute()).rejects.toMatchObject({
      errorCode: errorDictionary.tasks.transferFailed.errorCode,
    })

    expect(errorSpy).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })
})
