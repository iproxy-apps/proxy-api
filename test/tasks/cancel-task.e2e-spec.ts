import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/cancel (e2e)', () => {
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

  const hoursAgo = (hours: number) =>
    new Date(Date.now() - hours * 60 * 60 * 1000)

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .send({ taskId: 'task-1' })

    expect(response.status).toBe(401)
  })

  it('rejects when the caller is not the task owner', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const other = await createUser(ctx.app, ctx.prisma, {
      email: 'other@test.io',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_CANCEL_TASK' })
  })

  it('rejects when the task started more than 1 hour ago', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: hoursAgo(2),
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_CANCEL_TASK' })
  })

  it('refunds the payment and cancels the task within the grace period', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
      offeredPrice: 50,
    })
    const payment = await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_refundable',
        amount: 50,
      },
    })
    ctx.stripeMock.refundPayment.mockResolvedValueOnce({
      id: 're_success',
      status: 'succeeded',
    } as Awaited<ReturnType<typeof ctx.stripeMock.refundPayment>>)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.refundPayment).toHaveBeenCalledWith('pi_refundable')

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('canceled')
    expect(updatedTask?.canceledAt).not.toBeNull()

    const updatedPayment = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updatedPayment?.refundId).toBe('re_success')
  })

  it('cancels an available task without refund (no payment yet)', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'available',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.refundPayment).not.toHaveBeenCalled()

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('canceled')
    expect(updatedTask?.canceledAt).not.toBeNull()
  })

  it('cancels an in_progress task without refund when there is no payment record', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.refundPayment).not.toHaveBeenCalled()

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('canceled')
    expect(updatedTask?.canceledAt).not.toBeNull()
  })

  it('rejects canceling a terminal task', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'completed',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_CANCEL_TASK' })
  })
})
