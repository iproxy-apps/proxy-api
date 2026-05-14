import request from 'supertest'

import { createTask } from '../factories/task.factory'
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
    ctx.stripeMock.createTransfer.mockClear()
    ctx.stripeMock.createTransfer.mockResolvedValue({
      id: 'tr_test_e2e',
    } as unknown as Awaited<ReturnType<typeof ctx.stripeMock.createTransfer>>)
  })

  const seedTaskPendingValidation = async (
    offeredPrice = 100,
    overrides: { stripeAccountReady?: boolean; stripeAccountId?: string | null } = {},
  ) => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
      stripeAccountId:
        overrides.stripeAccountId === undefined
          ? 'acct_proxy_test'
          : overrides.stripeAccountId,
      stripeAccountReady: overrides.stripeAccountReady ?? true,
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
      startedAt: new Date(),
      completedAt: new Date(),
      offeredPrice,
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    return { owner, proxy, task }
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

  it('completes the task, pays the executor and increments their counter', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(200)

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.completedAt).not.toBeNull()
    expect(updatedTask?.transferId).toBe('tr_test_e2e')

    // Stripe.transfers.create expects amount in cents
    expect(ctx.stripeMock.createTransfer).toHaveBeenCalledWith({
      amount: 7562,
      destination: 'acct_proxy_test',
      metadata: { taskId: task.id },
    })

    const updatedProxy = await ctx.prisma.users.findUnique({
      where: { id: proxy.id },
    })
    expect(updatedProxy?.totalTasksCompleted).toBe(1)
    // 100 - (100 * 0.0399 + 0.39) - (100 * 0.2) = 75.62
    expect(Number(updatedProxy?.walletBalance)).toBeCloseTo(75.62, 2)

    const ratings = await ctx.prisma.ratings.findMany({
      where: { taskId: task.id },
    })
    expect(ratings).toHaveLength(0)
    expect(Number(updatedProxy?.rating)).toBe(0)
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
    expect(response.body).toMatchObject({ errorCode: 'PROXY_ACCOUNT_NOT_READY' })

    expect(ctx.stripeMock.createTransfer).not.toHaveBeenCalled()

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

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)

    const stored = await ctx.prisma.ratings.findMany({
      where: { taskId: task.id },
    })
    expect(stored).toHaveLength(0)
  })
})
