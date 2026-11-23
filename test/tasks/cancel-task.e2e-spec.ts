import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createPayment } from '../factories/payment.factory'
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

  const cancel = (token: string, taskId: string) =>
    request(ctx.app.getHttpServer())
      .post('/tasks/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ taskId })

  const inProgressTask = async (ownerId: string) =>
    createTask(ctx.prisma, ownerId, {
      status: 'in_progress',
      startedAt: new Date(),
      offeredPrice: 50,
    })

  it('refunds the full charge and cancels within the grace period', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await inProgressTask(owner.id)
    const payment = await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_refundable',
      status: 'succeeded',
      amount: 50,
    })

    const response = await cancel(owner.token, task.id)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledWith(
      'pi_refundable',
      `task:${task.id}:refund`,
    )

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('canceled')
    expect(updatedTask?.canceledAt).not.toBeNull()

    const updatedPayment = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updatedPayment?.status).toBe('refunded')
    expect(updatedPayment?.refundId).toBe('re_test_123')
  })

  it('accepts a refund that Stripe reports as pending', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await inProgressTask(owner.id)
    const payment = await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_pending_refund',
      status: 'succeeded',
    })
    ctx.stripeMock.refundPaymentIntent.mockResolvedValueOnce({
      id: 're_pending',
      status: 'pending',
    } as Awaited<ReturnType<typeof ctx.stripeMock.refundPaymentIntent>>)

    const response = await cancel(owner.token, task.id)

    expect(response.status).toBe(200)
    const updatedPayment = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updatedPayment?.status).toBe('refunded')
    expect(updatedPayment?.refundId).toBe('re_pending')
  })

  it('refuses to cancel when the latest payment is disputed', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await inProgressTask(owner.id)
    const payment = await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_disp',
      status: 'disputed',
      disputeId: 'dp_1',
    })

    const response = await cancel(owner.token, task.id)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'PAYMENT_DISPUTED' })
    expect(ctx.stripeMock.refundPaymentIntent).not.toHaveBeenCalled()

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('in_progress')
    expect(updatedTask?.canceledAt).toBeNull()
    const updatedPayment = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updatedPayment?.status).toBe('disputed')
  })

  it('refunds only the latest payment when an older failed row exists', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await inProgressTask(owner.id)
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_old',
      status: 'failed',
      createdAt: new Date(Date.now() - 3_600_000),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_new',
      status: 'succeeded',
    })

    const response = await cancel(owner.token, task.id)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledTimes(1)
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledWith(
      'pi_new',
      `task:${task.id}:refund`,
    )
  })

  it.each([['failed'], ['refunded'], ['pending']] as const)(
    'cancels without a Stripe call when the latest payment is %s',
    async (status) => {
      const owner = await createUser(ctx.app, ctx.prisma)
      const task = await inProgressTask(owner.id)
      const payment = await createPayment(ctx.prisma, task.id, {
        paymentIntent: `pi_${status}`,
        status,
      })

      const response = await cancel(owner.token, task.id)

      expect(response.status).toBe(200)
      expect(ctx.stripeMock.refundPaymentIntent).not.toHaveBeenCalled()

      const updatedTask = await ctx.prisma.tasks.findUnique({
        where: { id: task.id },
      })
      expect(updatedTask?.status).toBe('canceled')
      const updatedPayment = await ctx.prisma.payments.findUnique({
        where: { id: payment.id },
      })
      expect(updatedPayment?.status).toBe(status)
    },
  )

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
    expect(ctx.stripeMock.refundPaymentIntent).not.toHaveBeenCalled()

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
    expect(ctx.stripeMock.refundPaymentIntent).not.toHaveBeenCalled()

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('canceled')
    expect(updatedTask?.canceledAt).not.toBeNull()
  })

  it('restores in_progress when the refund fails', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await inProgressTask(owner.id)
    const payment = await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_fail',
      status: 'succeeded',
    })
    ctx.stripeMock.refundPaymentIntent.mockRejectedValueOnce(
      new Error('charge_already_refunded'),
    )

    const response = await cancel(owner.token, task.id)

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ errorCode: 'REFUND_FAILED' })

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('in_progress')
    expect(updatedTask?.canceledAt).toBeNull()
    const updatedPayment = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updatedPayment?.status).toBe('succeeded')
  })

  it('refunds once and rejects a second cancel of the same task', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await inProgressTask(owner.id)
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_twice',
      status: 'succeeded',
    })

    const first = await cancel(owner.token, task.id)
    const second = await cancel(owner.token, task.id)

    expect(first.status).toBe(200)
    expect(second.status).toBe(403)
    expect(second.body).toMatchObject({ errorCode: 'CANNOT_CANCEL_TASK' })
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledTimes(1)
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
