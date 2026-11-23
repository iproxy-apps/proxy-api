import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createPayment } from '../factories/payment.factory'
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

  it('rejects when the PROXY has not completed Stripe onboarding', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
      stripeAccountReady: false,
    })
    const task = await createTask(ctx.prisma, owner.id)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${proxy.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_PROXY' })
  })

  const seed = async (
    opts: {
      withCard?: boolean
      offeredPrice?: number
      task?: Parameters<typeof createTask>[2]
    } = {},
  ) => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    if (opts.withCard !== false) {
      await ctx.prisma.cards.create({
        data: {
          userId: owner.id,
          stripeCardId: 'pm_owner',
          brand: 'visa',
          last4: '4242',
        },
      })
    }
    const task = await createTask(ctx.prisma, owner.id, {
      offeredPrice: opts.offeredPrice ?? 100,
      ...opts.task,
    })
    return { owner, proxy, task }
  }

  const start = (user: { token: string }, taskId: string) =>
    request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ taskId })

  const stored = (taskId: string) =>
    ctx.prisma.tasks.findUniqueOrThrow({ where: { id: taskId } })

  const mappingOf = (taskId: string) =>
    ctx.prisma.userTaskMapping.findUnique({ where: { taskId } })

  const paymentCount = (taskId: string) =>
    ctx.prisma.payments.count({ where: { taskId } })

  const flagOf = async (ownerId: string) =>
    (await ctx.prisma.users.findUniqueOrThrow({ where: { id: ownerId } }))
      .cardActionRequired

  const stripeKeys = () =>
    ctx.stripeMock.chargeSavedCard.mock.calls.map((c) => c[1])

  it('answers 409 PAYMENT_FAILED, notifies the client and writes nothing when the owner has no card', async () => {
    const { owner, proxy, task } = await seed({ withCard: false })

    const response = await start(proxy, task.id)

    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('PAYMENT_FAILED')
    const t = await stored(task.id)
    expect(t.status).toBe('available')
    expect(t.startedAt).toBeNull()
    expect(await mappingOf(task.id)).toBeNull()
    expect(await paymentCount(task.id)).toBe(0)
    expect(ctx.stripeMock.chargeSavedCard).not.toHaveBeenCalled()
    expect(ctx.notificationMock.sendCardChargeFailedEmail).toHaveBeenCalledWith(
      owner.email,
      expect.any(String),
      task.title,
    )
    expect(await flagOf(owner.id)).toBe(true)
  })

  it('claims, charges and records the payment', async () => {
    const { owner, proxy, task } = await seed()

    const response = await start(proxy, task.id)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'succeeded' })
    const t = await stored(task.id)
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledWith(
      {
        amount: 10000,
        customer: owner.stripeCustomerId,
        paymentMethod: 'pm_owner',
        taskId: task.id,
        proxyId: proxy.id,
        claimedAt: t.startedAt!.toISOString(),
      },
      `start:${task.id}:${proxy.id}:${t.startedAt!.getTime()}`,
    )
    expect(t.status).toBe('in_progress')
    expect((await mappingOf(task.id))?.executorId).toBe(proxy.id)
    const payment = await ctx.prisma.payments.findUnique({
      where: { paymentIntent: 'pi_test_123' },
    })
    expect(payment?.status).toBe('succeeded')
    expect(payment?.chargeId).toBe('ch_test_123')
    expect(payment?.amount.toFixed(2)).toBe('100.00')
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).not.toHaveBeenCalled()
    expect(await flagOf(owner.id)).toBe(false)
  })

  it('sends integer centavos for prices with float artefacts (20.01 -> 2001)', async () => {
    const { proxy, task } = await seed({ offeredPrice: 20.01 })

    const response = await start(proxy, task.id)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.chargeSavedCard.mock.calls[0][0].amount).toBe(2001)
  })

  it('answers 409 PAYMENT_FAILED, releases the claim and notifies the client when the card is declined', async () => {
    const { owner, proxy, task } = await seed()
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(
      Object.assign(new Error('Your card was declined.'), {
        type: 'StripeCardError',
        code: 'card_declined',
        payment_intent: {
          id: 'pi_declined',
          status: 'requires_payment_method',
        },
      }),
    )

    const response = await start(proxy, task.id)

    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('PAYMENT_FAILED')
    expect(response.body.message).toBe(
      'Não foi possível cobrar o cliente. Tente outra tarefa.',
    )
    const t = await stored(task.id)
    expect(t.status).toBe('available')
    expect(t.startedAt).toBeNull()
    expect(await mappingOf(task.id)).toBeNull()
    expect(await paymentCount(task.id)).toBe(0)
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).toHaveBeenCalledTimes(1)
    expect(await flagOf(owner.id)).toBe(true)
  })

  it('treats requires_action as a definite failure (no 3DS on the proxy device)', async () => {
    const { proxy, task } = await seed()
    ctx.stripeMock.chargeSavedCard.mockResolvedValueOnce({
      id: 'pi_3ds',
      status: 'requires_action',
      client_secret: 'x',
    } as Awaited<ReturnType<typeof ctx.stripeMock.chargeSavedCard>>)

    const response = await start(proxy, task.id)

    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('PAYMENT_FAILED')
    expect((await stored(task.id)).status).toBe('available')
    expect(await mappingOf(task.id)).toBeNull()
    expect(await paymentCount(task.id)).toBe(0)
    expect(response.body).not.toHaveProperty('clientSecret')
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).toHaveBeenCalledTimes(1)
  })

  it('keeps the claim and answers PAYMENT_PENDING when Stripe is unreachable; the retry reuses the key', async () => {
    const { proxy, task } = await seed()
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(
      Object.assign(new Error('socket hang up'), {
        type: 'StripeConnectionError',
      }),
    )

    const first = await start(proxy, task.id)

    expect(first.status).toBe(409)
    expect(first.body.errorCode).toBe('PAYMENT_PENDING')
    expect((await stored(task.id)).status).toBe('in_progress')
    expect((await mappingOf(task.id))?.executorId).toBe(proxy.id)
    expect(await paymentCount(task.id)).toBe(0)
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).not.toHaveBeenCalled()

    const second = await start(proxy, task.id)

    expect(second.status).toBe(200)
    const keys = stripeKeys()
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(await paymentCount(task.id)).toBe(1)
    expect(
      (
        await ctx.prisma.payments.findFirstOrThrow({
          where: { taskId: task.id },
        })
      ).status,
    ).toBe('succeeded')
  })

  it('keeps the claim on a processing outcome', async () => {
    const { proxy, task } = await seed()
    ctx.stripeMock.chargeSavedCard.mockResolvedValueOnce({
      id: 'pi_proc',
      status: 'processing',
      latest_charge: null,
    } as Awaited<ReturnType<typeof ctx.stripeMock.chargeSavedCard>>)

    const response = await start(proxy, task.id)

    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('PAYMENT_PENDING')
    expect((await stored(task.id)).status).toBe('in_progress')
    expect(await paymentCount(task.id)).toBe(0)
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).not.toHaveBeenCalled()
  })

  it('opens a new claim with a new key when the same proxy retries after a decline', async () => {
    const { proxy, task } = await seed()
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(
      Object.assign(new Error('declined'), { type: 'StripeCardError' }),
    )

    expect((await start(proxy, task.id)).status).toBe(409)
    expect((await start(proxy, task.id)).status).toBe(200)

    const keys = stripeKeys()
    expect(keys[0]).not.toBe(keys[1])
    expect(await paymentCount(task.id)).toBe(1)
    expect(
      (
        await ctx.prisma.payments.findFirstOrThrow({
          where: { taskId: task.id },
        })
      ).status,
    ).toBe('succeeded')
  })

  it('lets exactly one of two different proxies claim and charges the client once', async () => {
    const { proxy: proxy1, task } = await seed()
    const proxy2 = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy2@test.io',
      userType: 'PROXY',
    })

    const [a, b] = await Promise.all([
      start(proxy1, task.id),
      start(proxy2, task.id),
    ])

    expect([a.status, b.status].sort()).toEqual([200, 400])
    const [winner, loser] = a.status === 200 ? [proxy1, b] : [proxy2, a]
    expect(loser.body.errorCode).toBe('TASK_NOT_AVAILABLE')
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledTimes(1)
    expect(ctx.stripeMock.chargeSavedCard.mock.calls[0][0].proxyId).toBe(
      winner.id,
    )
    expect((await mappingOf(task.id))?.executorId).toBe(winner.id)
    expect(await paymentCount(task.id)).toBe(1)
    expect(
      (
        await ctx.prisma.payments.findFirstOrThrow({
          where: { taskId: task.id },
        })
      ).status,
    ).toBe('succeeded')
  })

  it('same proxy double-tap: one PaymentIntent, one payment row, no release', async () => {
    const { proxy, task } = await seed()

    const [a, b] = await Promise.all([
      start(proxy, task.id),
      start(proxy, task.id),
    ])

    expect([a.status, b.status]).toEqual([200, 200])
    expect(new Set(stripeKeys()).size).toBe(1)
    expect((await stored(task.id)).status).toBe('in_progress')
    expect((await mappingOf(task.id))?.executorId).toBe(proxy.id)
    expect(await paymentCount(task.id)).toBe(1)
    expect(
      (
        await ctx.prisma.payments.findFirstOrThrow({
          where: { taskId: task.id },
        })
      ).status,
    ).toBe('succeeded')
  })

  it('replays 200 without a card lookup, flag or e-mail once the card was removed after a successful start', async () => {
    const { owner, proxy, task } = await seed()
    expect((await start(proxy, task.id)).status).toBe(200)
    await ctx.prisma.cards.updateMany({
      where: { userId: owner.id },
      data: { isDeleted: true },
    })

    const replay = await start(proxy, task.id)

    expect(replay.status).toBe(200)
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledTimes(1)
    expect(await flagOf(owner.id)).toBe(false)
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).not.toHaveBeenCalled()
  })

  it('keeps answering PAYMENT_PENDING for the claim holder when the card was removed meanwhile', async () => {
    const { owner, proxy, task } = await seed()
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(
      Object.assign(new Error('socket hang up'), {
        type: 'StripeConnectionError',
      }),
    )
    expect((await start(proxy, task.id)).body.errorCode).toBe('PAYMENT_PENDING')
    await ctx.prisma.cards.updateMany({
      where: { userId: owner.id },
      data: { isDeleted: true },
    })

    const retry = await start(proxy, task.id)

    expect(retry.status).toBe(409)
    expect(retry.body.errorCode).toBe('PAYMENT_PENDING')
    expect((await stored(task.id)).status).toBe('in_progress')
    expect(await flagOf(owner.id)).toBe(false)
    expect(
      ctx.notificationMock.sendCardChargeFailedEmail,
    ).not.toHaveBeenCalled()
  })

  it('replays 200 without a second charge once the start succeeded', async () => {
    const { proxy, task } = await seed()

    expect((await start(proxy, task.id)).status).toBe(200)
    expect((await start(proxy, task.id)).status).toBe(200)

    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledTimes(1)
  })

  it('charges offeredPrice for a legacy task without stored fees and an older failed payment row', async () => {
    const { proxy, task } = await seed({
      task: {
        offeredPrice: 100,
        chargedAmount: null,
        platformFee: null,
        stripeFee: null,
        proxyEarnings: null,
      },
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_legacy',
      status: 'failed',
      createdAt: new Date(Date.now() - 3_600_000),
    })

    const response = await start(proxy, task.id)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.chargeSavedCard.mock.calls[0][0].amount).toBe(10000)
    expect(await paymentCount(task.id)).toBe(2)
    const latest = await ctx.prisma.payments.findFirstOrThrow({
      where: { taskId: task.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(latest.paymentIntent).toBe('pi_test_123')
    expect(latest.status).toBe('succeeded')
  })

  it('returns 400 VALIDATION_FAILED for a non-UUID taskId', async () => {
    const proxy = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${proxy.token}`)
      .send({ taskId: 'not-a-uuid' })
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
    expect(ctx.stripeMock.chargeSavedCard).not.toHaveBeenCalled()
  })
})
