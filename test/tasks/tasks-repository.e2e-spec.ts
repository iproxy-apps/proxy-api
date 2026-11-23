import { Prisma } from '@prisma/client'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createPayment } from '../factories/payment.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'
import { TasksRepository } from 'src/modules/tasks/repository/tasks.repository'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'

import type { TestAppContext } from '../setup/test-app.factory'
import type { CreatedUser } from '../factories/user.factory'

describe('TasksRepository / PaymentsRepository (e2e)', () => {
  let ctx: TestAppContext
  let repo: TasksRepository
  let payments: PaymentsRepository
  let owner: CreatedUser
  let proxy: CreatedUser
  let proxy2: CreatedUser
  let task: Awaited<ReturnType<typeof createTask>>
  let task2: Awaited<ReturnType<typeof createTask>>

  beforeAll(async () => {
    ctx = await createTestApp()
    repo = ctx.app.get(TasksRepository)
    payments = ctx.app.get(PaymentsRepository)
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
    owner = await createUser(ctx.app, ctx.prisma, { email: 'owner@test.io' })
    proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    proxy2 = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy2@test.io',
      userType: 'PROXY',
    })
    task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    task2 = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
  })

  const claimFor = (
    taskId: string,
    executorId = proxy.id,
    startedAt = new Date(),
  ) => ({ taskId, executorId, startedAt })

  it('transition is a no-op when the from-status does not match', async () => {
    const t = await createTask(ctx.prisma, owner.id, { status: 'canceled' })
    await expect(
      repo.transition({
        taskId: t.id,
        from: ['in_progress'],
        to: 'verification_required',
        data: { completedAt: new Date() },
      }),
    ).resolves.toBe(false)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: t.id },
    })
    expect(stored.status).toBe('canceled')
    expect(stored.completedAt).toBeNull()
  })

  it('transition writes status and data when the from-status matches', async () => {
    await expect(
      repo.transition({
        taskId: task.id,
        from: ['in_progress'],
        to: 'verification_required',
        data: {
          completedAt: new Date(),
          proofImageUrl: `${task.id}/a.jpg`,
        },
      }),
    ).resolves.toBe(true)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(stored.status).toBe('verification_required')
    expect(stored.proofImageUrl).toBe(`${task.id}/a.jpg`)
  })

  it('claimTask claims an available task atomically and writes no payment', async () => {
    const t = await createTask(ctx.prisma, owner.id)
    const startedAt = new Date()
    await expect(
      repo.claimTask(claimFor(t.id, proxy.id, startedAt)),
    ).resolves.toBe(true)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: t.id },
    })
    expect(stored.status).toBe('in_progress')
    expect(stored.startedAt?.getTime()).toBe(startedAt.getTime())
    expect(
      (await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: t.id } }))
        ?.executorId,
    ).toBe(proxy.id)
    expect(await ctx.prisma.payments.count({ where: { taskId: t.id } })).toBe(0)
  })

  it('fetchClaim reads status, startedAt and executor in one snapshot', async () => {
    const t = await createTask(ctx.prisma, owner.id)
    await expect(repo.fetchClaim(t.id)).resolves.toEqual({
      status: 'available',
      startedAt: null,
      executorId: null,
    })
    const startedAt = new Date()
    await repo.claimTask(claimFor(t.id, proxy.id, startedAt))
    await expect(repo.fetchClaim(t.id)).resolves.toEqual({
      status: 'in_progress',
      startedAt,
      executorId: proxy.id,
    })
    await expect(
      repo.fetchClaim('00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeNull()
  })

  it('claimTask returns false and writes nothing when the task is not available', async () => {
    await expect(repo.claimTask(claimFor(task.id))).resolves.toBe(false)
    expect(
      await ctx.prisma.userTaskMapping.findUnique({
        where: { taskId: task.id },
      }),
    ).toBeNull()
  })

  it('exactly one of two concurrent claims wins', async () => {
    const t = await createTask(ctx.prisma, owner.id)
    const results = await Promise.all([
      repo.claimTask(claimFor(t.id, proxy.id)),
      repo.claimTask(claimFor(t.id, proxy2.id)),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(
      await ctx.prisma.userTaskMapping.count({ where: { taskId: t.id } }),
    ).toBe(1)
  })

  it('releaseClaim reverts task and mapping for the matching claim only', async () => {
    const t = await createTask(ctx.prisma, owner.id)
    const startedAt = new Date()
    await repo.claimTask(claimFor(t.id, proxy.id, startedAt))
    await expect(
      repo.releaseClaim({
        taskId: t.id,
        executorId: proxy.id,
        startedAt: new Date(startedAt.getTime() - 1000),
      }),
    ).resolves.toBe(false)
    expect(
      (await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: t.id } }))
        .status,
    ).toBe('in_progress')
    await expect(
      repo.releaseClaim({ taskId: t.id, executorId: proxy.id, startedAt }),
    ).resolves.toBe(true)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: t.id },
    })
    expect(stored.status).toBe('available')
    expect(stored.startedAt).toBeNull()
    expect(
      await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: t.id } }),
    ).toBeNull()
  })

  it('releaseClaim flags the owner card when cardActionOwnerId is given', async () => {
    const t1 = await createTask(ctx.prisma, owner.id)
    const s1 = new Date()
    await repo.claimTask(claimFor(t1.id, proxy.id, s1))
    await repo.releaseClaim({
      taskId: t1.id,
      executorId: proxy.id,
      startedAt: s1,
    })
    expect(
      (await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } }))
        .cardActionRequired,
    ).toBe(false)
    const t2 = await createTask(ctx.prisma, owner.id)
    const s2 = new Date()
    await repo.claimTask(claimFor(t2.id, proxy.id, s2))
    await repo.releaseClaim({
      taskId: t2.id,
      executorId: proxy.id,
      startedAt: s2,
      cardActionOwnerId: owner.id,
    })
    expect(
      (await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } }))
        .cardActionRequired,
    ).toBe(true)
  })

  it('recordSucceededCharge is idempotent and back-fills chargeId', async () => {
    const data = {
      taskId: task.id,
      paymentIntent: 'pi_rec',
      amount: new Prisma.Decimal('100'),
      chargeId: null,
    }
    await payments.recordSucceededCharge(data)
    const row = await payments.recordSucceededCharge({
      ...data,
      chargeId: 'ch_rec',
    })
    expect(row.status).toBe('succeeded')
    expect(row.chargeId).toBe('ch_rec')
    expect(row.amount.toFixed(2)).toBe('100.00')
    await Promise.all([
      payments.recordSucceededCharge(data),
      payments.recordSucceededCharge(data),
    ])
    expect(
      await ctx.prisma.payments.count({ where: { taskId: task.id } }),
    ).toBe(1)
  })

  it('recordSucceededCharge never downgrades a refunded or disputed row', async () => {
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_ref',
      status: 'refunded',
      chargeId: 'ch_ref',
      refundId: 're_1',
    })
    const row = await payments.recordSucceededCharge({
      taskId: task.id,
      paymentIntent: 'pi_ref',
      amount: new Prisma.Decimal('100'),
      chargeId: 'ch_ref',
    })
    expect(row.status).toBe('refunded')
  })

  it('recordTransfer increments counters and wallet atomically', async () => {
    await repo.recordTransfer({
      taskId: task.id,
      executorId: proxy.id,
      transferId: 'tr_1',
      proxyEarnings: new Prisma.Decimal('80'),
    })
    await repo.recordTransfer({
      taskId: task2.id,
      executorId: proxy.id,
      transferId: 'tr_2',
      proxyEarnings: new Prisma.Decimal('40'),
    })
    const u = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: proxy.id },
    })
    expect(u.totalTasksCompleted).toBe(2)
    expect(u.walletBalance.toFixed(2)).toBe('120.00')
  })

  it('fetchLatestByTaskId returns the newest payment', async () => {
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_old',
      status: 'failed',
      createdAt: new Date(Date.now() - 3_600_000),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_new',
      status: 'succeeded',
    })
    expect((await payments.fetchLatestByTaskId(task.id))?.paymentIntent).toBe(
      'pi_new',
    )
    expect((await payments.findByPaymentIntent('pi_old'))?.status).toBe(
      'failed',
    )
  })
})
