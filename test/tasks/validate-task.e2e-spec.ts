import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createPayment } from '../factories/payment.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/validate (e2e)', () => {
  let ctx: TestAppContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
    ctx.stripeMock.findTransferByGroup.mockReset()
    ctx.stripeMock.findTransferByGroup.mockResolvedValue(null)
    ctx.stripeMock.createTransferFromCharge.mockReset()
    ctx.stripeMock.createTransferFromCharge.mockResolvedValue({
      id: 'tr_test_123',
    } as unknown as Awaited<
      ReturnType<typeof ctx.stripeMock.createTransferFromCharge>
    >)
  })

  type SeedPayment = Parameters<typeof createPayment>[2]

  const seedTaskPendingValidation = async (
    offeredPrice = 100,
    overrides: {
      stripeAccountReady?: boolean
      stripeAccountId?: string | null
      payment?: SeedPayment | null
      proxyEarnings?: number | null
    } = {},
    ownerEmail = 'owner@test.io',
    proxyId?: { id: string; token: string },
  ) => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: ownerEmail,
    })
    const proxy =
      proxyId ??
      (await createUser(ctx.app, ctx.prisma, {
        email: 'proxy@test.io',
        userType: 'PROXY',
        stripeAccountId:
          overrides.stripeAccountId === undefined
            ? 'acct_proxy_test'
            : overrides.stripeAccountId,
        stripeAccountReady: overrides.stripeAccountReady ?? true,
      }))
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
      startedAt: new Date(),
      completedAt: new Date(),
      offeredPrice,
      ...(overrides.proxyEarnings !== undefined && {
        proxyEarnings: overrides.proxyEarnings,
      }),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    if (overrides.payment !== null) {
      await createPayment(ctx.prisma, task.id, {
        paymentIntent: `pi_${task.id}`,
        ...(overrides.payment ?? {
          status: 'succeeded',
          chargeId: 'ch_test_1',
          amount: offeredPrice,
        }),
      })
    }
    return { owner, proxy, task }
  }

  const validate = (token: string, taskId: string) =>
    request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ taskId })

  const readState = async (taskId: string, proxyId: string) => {
    const task = await ctx.prisma.tasks.findUnique({ where: { id: taskId } })
    const proxy = await ctx.prisma.users.findUnique({ where: { id: proxyId } })
    return { task, proxy }
  }

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .send({ taskId: 'task-1' })

    expect(response.status).toBe(401)
  })

  it('returns 404 when the task does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ taskId: '00000000-0000-0000-0000-000000000000' })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('rejects when the caller is not the task owner', async () => {
    const { task } = await seedTaskPendingValidation()
    const other = await createUser(ctx.app, ctx.prisma, {
      email: 'other@test.io',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_VALIDATE_TASK' })
  })

  it('completes the task, transfers 80 % of the offered price from the charge and credits the proxy', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100)

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(200)

    const { task: updatedTask, proxy: updatedProxy } = await readState(
      task.id,
      proxy.id,
    )
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.completedAt).not.toBeNull()
    expect(updatedTask?.transferId).toBe('tr_test_123')
    expect(updatedTask?.platformFee?.toFixed(2)).toBe('20.00')
    expect(updatedTask?.proxyEarnings?.toFixed(2)).toBe('80.00')
    expect(updatedTask?.chargedAmount?.toFixed(2)).toBe('100.00')

    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(
      {
        amount: 8000,
        destination: 'acct_proxy_test',
        sourceTransaction: 'ch_test_1',
        transferGroup: task.id,
        taskId: task.id,
      },
      `task:${task.id}:transfer`,
    )

    expect(updatedProxy?.totalTasksCompleted).toBe(1)
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('80.00')

    const ratings = await ctx.prisma.ratings.findMany({
      where: { taskId: task.id },
    })
    expect(ratings).toHaveLength(0)
    expect(Number(updatedProxy?.rating)).toBe(0)
  })

  it('reuses an existing transfer of the group and credits the wallet once', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100)
    ctx.stripeMock.findTransferByGroup.mockResolvedValue({
      id: 'tr_existing',
    } as unknown as Awaited<
      ReturnType<typeof ctx.stripeMock.findTransferByGroup>
    >)

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.findTransferByGroup).toHaveBeenCalledWith(task.id)
    expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()

    const { task: updatedTask, proxy: updatedProxy } = await readState(
      task.id,
      proxy.id,
    )
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.transferId).toBe('tr_existing')
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('80.00')
  })

  it('computes the 80 % transfer for a legacy task without stored proxyEarnings', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100, {
      proxyEarnings: null,
    })

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 8000 }),
      `task:${task.id}:transfer`,
    )
    const { proxy: updatedProxy } = await readState(task.id, proxy.id)
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('80.00')
  })

  it.each([['pending'], ['failed'], ['refunded']] as const)(
    'refuses with 409 PAYMENT_NOT_CONFIRMED when the latest payment is %s',
    async (status) => {
      const { owner, proxy, task } = await seedTaskPendingValidation(100, {
        payment: { status, amount: 100 },
      })

      const response = await validate(owner.token, task.id)

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({
        errorCode: 'PAYMENT_NOT_CONFIRMED',
      })
      expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()

      const { task: stored, proxy: storedProxy } = await readState(
        task.id,
        proxy.id,
      )
      expect(stored?.status).toBe('verification_required')
      expect(stored?.transferId).toBeNull()
      expect(storedProxy?.walletBalance.toFixed(2)).toBe('0.00')
    },
  )

  it('refuses with 409 TASK_STATUS_CONFLICT when the task is not awaiting validation', async () => {
    const { owner, task } = await seedTaskPendingValidation(100)
    await ctx.prisma.tasks.update({
      where: { id: task.id },
      data: { status: 'in_progress' },
    })

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'TASK_STATUS_CONFLICT' })
    expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()
  })

  it('refuses when there is no payment row', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100, {
      payment: null,
    })

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'PAYMENT_NOT_CONFIRMED' })
    expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()
    const { task: stored, proxy: storedProxy } = await readState(
      task.id,
      proxy.id,
    )
    expect(stored?.status).toBe('verification_required')
    expect(storedProxy?.walletBalance.toFixed(2)).toBe('0.00')
  })

  it('refuses a succeeded payment without chargeId (legacy row)', async () => {
    const { owner, task } = await seedTaskPendingValidation(100, {
      payment: { status: 'succeeded', chargeId: null, amount: 100 },
    })

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'PAYMENT_NOT_CONFIRMED' })
    expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()
  })

  it('refuses a disputed payment', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100, {
      payment: { status: 'disputed', disputeId: 'dp_1', chargeId: 'ch_test_1' },
    })

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'PAYMENT_DISPUTED' })
    expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()
    const { task: stored, proxy: storedProxy } = await readState(
      task.id,
      proxy.id,
    )
    expect(stored?.status).toBe('verification_required')
    expect(storedProxy?.walletBalance.toFixed(2)).toBe('0.00')
  })

  it('reverts to verification_required when the transfer fails', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100)
    ctx.stripeMock.createTransferFromCharge.mockRejectedValueOnce(
      new Error('balance_insufficient'),
    )

    const response = await validate(owner.token, task.id)

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ errorCode: 'TASK_TRANSFER_FAILED' })

    const { task: stored, proxy: storedProxy } = await readState(
      task.id,
      proxy.id,
    )
    expect(stored?.status).toBe('verification_required')
    expect(stored?.transferId).toBeNull()
    expect(storedProxy?.walletBalance.toFixed(2)).toBe('0.00')
    expect(storedProxy?.totalTasksCompleted).toBe(0)
  })

  it('pays exactly once under concurrent validates', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100)

    const [a, b] = await Promise.all([
      validate(owner.token, task.id),
      validate(owner.token, task.id),
    ])

    expect([a.status, b.status].sort()).toEqual([200, 409])
    const loser = a.status === 409 ? a : b
    expect(loser.body).toMatchObject({ errorCode: 'TASK_STATUS_CONFLICT' })
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledTimes(1)
    const { proxy: updatedProxy } = await readState(task.id, proxy.id)
    expect(updatedProxy?.totalTasksCompleted).toBe(1)
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('80.00')
  })

  it('increments the wallet atomically across concurrent validations of two tasks', async () => {
    const first = await seedTaskPendingValidation(100)
    ctx.stripeMock.createTransferFromCharge
      .mockResolvedValueOnce({ id: 'tr_test_a' } as never)
      .mockResolvedValueOnce({ id: 'tr_test_b' } as never)
    const second = await seedTaskPendingValidation(
      50,
      {},
      'owner2@test.io',
      first.proxy,
    )

    const [a, b] = await Promise.all([
      validate(first.owner.token, first.task.id),
      validate(second.owner.token, second.task.id),
    ])

    expect([a.status, b.status]).toEqual([200, 200])
    const { proxy: updatedProxy } = await readState(
      first.task.id,
      first.proxy.id,
    )
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('120.00')
    expect(updatedProxy?.totalTasksCompleted).toBe(2)
  })

  it('returns 409 PROXY_ACCOUNT_NOT_READY and skips the transfer when the proxy onboarding is incomplete', async () => {
    const { owner, task } = await seedTaskPendingValidation(100, {
      stripeAccountReady: false,
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      errorCode: 'PROXY_ACCOUNT_NOT_READY',
    })

    expect(ctx.stripeMock.createTransferFromCharge).not.toHaveBeenCalled()

    const stored = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(stored?.status).toBe('verification_required')
    expect(stored?.transferId).toBeNull()
  })

  it('records the rating and updates the proxy rating average when provided', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id, rating: 4, comment: 'muito bom' })

    expect(response.status).toBe(200)

    const rating = await ctx.prisma.ratings.findUnique({
      where: { taskId: task.id },
    })
    expect(rating).toMatchObject({
      raterId: owner.id,
      ratedId: proxy.id,
      score: 4,
      comment: 'muito bom',
    })

    const updatedProxy = await ctx.prisma.users.findUnique({
      where: { id: proxy.id },
    })
    expect(Number(updatedProxy?.rating)).toBe(4)
  })

  it('rejects ratings outside of the 1-5 range', async () => {
    const { owner, task } = await seedTaskPendingValidation()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id, rating: 6 })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })

    const stored = await ctx.prisma.ratings.findMany({
      where: { taskId: task.id },
    })
    expect(stored).toHaveLength(0)
  })
})
