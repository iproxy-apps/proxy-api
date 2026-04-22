import Stripe from 'stripe'
import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /stripe/webhook (e2e)', () => {
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

  const mockEvent = (
    type: Stripe.Event.Type,
    data: unknown,
    id = `evt_${Date.now()}`,
  ) => {
    ctx.stripeMock.constructWebhookEvent.mockReturnValueOnce({
      id,
      type,
      data: { object: data },
    } as unknown as Stripe.Event)
    return id
  }

  const postWebhook = () =>
    request(ctx.app.getHttpServer())
      .post('/stripe/webhook')
      .set('stripe-signature', 'test-signature')
      .set('Content-Type', 'application/json')
      .send('{}')

  it('rejects requests without a stripe-signature header', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/stripe/webhook')
      .send('{}')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'WEBHOOK_INVALID_SIGNATURE',
    })
  })

  it('rejects requests with an invalid signature', async () => {
    ctx.stripeMock.constructWebhookEvent.mockImplementationOnce(() => {
      throw new Error('signature mismatch')
    })

    const response = await postWebhook()

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'WEBHOOK_INVALID_SIGNATURE',
    })
  })

  it('marks a pending payment as succeeded on payment_intent.succeeded', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    const payment = await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_evt_1',
        amount: 50,
      },
    })

    mockEvent('payment_intent.succeeded', { id: 'pi_evt_1' })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ received: true })

    const updated = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updated?.status).toBe('succeeded')
  })

  it('reverts task and marks payment failed on payment_intent.payment_failed', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_evt_2',
        amount: 50,
      },
    })

    mockEvent('payment_intent.payment_failed', { id: 'pi_evt_2' })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('available')
    expect(updatedTask?.startedAt).toBeNull()

    const mapping = await ctx.prisma.userTaskMapping.findUnique({
      where: { taskId: task.id },
    })
    expect(mapping).toBeNull()

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_evt_2' },
    })
    expect(payment?.status).toBe('failed')
  })

  it('marks payment as refunded on charge.refunded', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'canceled',
      startedAt: new Date(),
    })
    await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_evt_3',
        amount: 50,
      },
    })

    mockEvent('charge.refunded', {
      payment_intent: 'pi_evt_3',
      refunds: { data: [{ id: 're_abc' }] },
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_evt_3' },
    })
    expect(payment?.status).toBe('refunded')
    expect(payment?.refundId).toBe('re_abc')
  })

  it('flips stripeAccountReady on account.updated', async () => {
    const proxy = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountId: 'acct_ready',
    })

    mockEvent('account.updated', {
      id: 'acct_ready',
      charges_enabled: true,
      payouts_enabled: true,
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const updated = await ctx.prisma.users.findUnique({
      where: { id: proxy.id },
    })
    expect(updated?.stripeAccountReady).toBe(true)
  })

  it('processes the same event only once (idempotency)', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_evt_idem',
        amount: 50,
      },
    })

    const eventId = 'evt_idempotent'
    mockEvent('payment_intent.succeeded', { id: 'pi_evt_idem' }, eventId)
    const firstResponse = await postWebhook()
    expect(firstResponse.status).toBe(200)

    mockEvent('payment_intent.succeeded', { id: 'pi_evt_idem' }, eventId)
    const secondResponse = await postWebhook()
    expect(secondResponse.status).toBe(200)

    const stored = await ctx.prisma.stripeEvents.findMany()
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(eventId)
  })
})
