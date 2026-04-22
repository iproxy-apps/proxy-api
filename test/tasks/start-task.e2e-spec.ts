import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/start (e2e)', () => {
  let ctx: TestAppContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
  })

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .send({ taskId: 'task-1' })

    expect(response.status).toBe(401)
  })

  it('returns 404 when the task does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ taskId: '00000000-0000-0000-0000-000000000000' })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('rejects when the executor is the task owner', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    const task = await createTask(ctx.prisma, user.id)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_START_OWN_TASK' })
  })

  it('rejects when the executor is not a PROXY', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const client = await createUser(ctx.app, ctx.prisma, {
      email: 'client@test.io',
      userType: 'CLIENT',
    })
    const task = await createTask(ctx.prisma, owner.id)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_PROXY' })
  })

  it('starts the task, records the mapping and charges the owner', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    await ctx.prisma.cards.create({
      data: {
        userId: owner.id,
        stripeCardId: 'pm_owner',
        brand: 'visa',
        last4: '4242',
      },
    })
    const task = await createTask(ctx.prisma, owner.id, { offeredPrice: 100 })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${proxy.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(200)

    const updated = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(updated?.status).toBe('in_progress')
    expect(updated?.startedAt).not.toBeNull()

    const mapping = await ctx.prisma.userTaskMapping.findUnique({
      where: { taskId: task.id },
    })
    expect(mapping?.executorId).toBe(proxy.id)

    expect(ctx.stripeMock.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        savedCard: 'pm_owner',
        amount: 100 * 100,
        customer: owner.stripeCustomerId,
      }),
    )

    const payment = await ctx.prisma.payments.findFirst({
      where: { taskId: task.id },
    })
    expect(payment?.paymentIntent).toBe('pi_test_123')
  })
})
