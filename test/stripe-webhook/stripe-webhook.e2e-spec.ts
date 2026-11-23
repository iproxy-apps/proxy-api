import Stripe from 'stripe'
import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createPayment } from '../factories/payment.factory'
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
    ctx.stripeMock.constructWebhookEvent.mockReset()
    ctx.stripeMock.refundPaymentIntent.mockClear()
  })

  const seedUsers = async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    return { owner, proxy }
  }

  // in_progress task claimed by `proxy` at T, no payment row yet
  const claimedTask = async () => {
    const { owner, proxy } = await seedUsers()
    const T = new Date()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      offeredPrice: 100,
      startedAt: T,
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    return { task, proxy, T }
  }

  const meta = (task: { id: string }, proxy: { id: string }, T: Date) => ({
    taskId: task.id,
    proxyId: proxy.id,
    claimedAt: T.toISOString(),
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

  it('marks a legacy pending payment succeeded and stores the charge id', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    const payment = await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_1',
      status: 'pending',
    })

    mockEvent('payment_intent.succeeded', {
      id: 'pi_evt_1',
      amount: 5000,
      latest_charge: 'ch_evt_1',
    })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ received: true })
    const updated = await ctx.prisma.payments.findUnique({
      where: { id: payment.id },
    })
    expect(updated?.status).toBe('succeeded')
    expect(updated?.chargeId).toBe('ch_evt_1')
  })

  it('writes the payment row from metadata when start has not written it yet', async () => {
    const { task, proxy, T } = await claimedTask()

    mockEvent('payment_intent.succeeded', {
      id: 'pi_evt_meta',
      amount: 10000,
      latest_charge: 'ch_evt_meta',
      metadata: meta(task, proxy, T),
    })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    const payments = await ctx.prisma.payments.findMany({
      where: { taskId: task.id },
    })
    expect(payments).toHaveLength(1)
    expect(payments[0].status).toBe('succeeded')
    expect(payments[0].chargeId).toBe('ch_evt_meta')
    expect(payments[0].amount.toFixed(2)).toBe('100.00')
    const after = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(after?.status).toBe('in_progress')
  })

  it('is a no-op when start already wrote the row', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_dup',
      status: 'succeeded',
      chargeId: 'ch_dup',
    })

    mockEvent('payment_intent.succeeded', {
      id: 'pi_evt_dup',
      amount: 5000,
      latest_charge: 'ch_dup',
      metadata: { taskId: task.id },
    })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    const payments = await ctx.prisma.payments.findMany({
      where: { taskId: task.id },
    })
    expect(payments).toHaveLength(1)
    expect(payments[0].chargeId).toBe('ch_dup')
    expect(ctx.stripeMock.refundPaymentIntent).not.toHaveBeenCalled()
  })

  it('refunds a charge that lands on a canceled task', async () => {
    const { owner, proxy } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'canceled',
      canceledAt: new Date(),
    })

    mockEvent('payment_intent.succeeded', {
      id: 'pi_evt_late',
      amount: 5000,
      latest_charge: 'ch_late',
      metadata: {
        taskId: task.id,
        proxyId: proxy.id,
        claimedAt: new Date().toISOString(),
      },
    })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledWith(
      'pi_evt_late',
      `task:${task.id}:refund`,
    )
    const payment = await ctx.prisma.payments.findUnique({
      where: { paymentIntent: 'pi_evt_late' },
    })
    expect(payment?.status).toBe('refunded')
    expect(payment?.refundId).toBe('re_test_123')
  })

  it('does not touch a failed payment on payment_intent.succeeded', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'available',
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_failed',
      status: 'failed',
    })

    mockEvent('payment_intent.succeeded', {
      id: 'pi_evt_failed',
      amount: 5000,
      latest_charge: 'ch_x',
      metadata: { taskId: task.id },
    })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    const payment = await ctx.prisma.payments.findUnique({
      where: { paymentIntent: 'pi_evt_failed' },
    })
    expect(payment?.status).toBe('failed')
    expect(payment?.chargeId).toBeNull()
  })

  it('reverts an in_progress task on payment_failed only while the legacy payment is pending', async () => {
    const { owner, proxy } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_2',
      status: 'pending',
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

  it('leaves a verification_required task untouched on payment_failed', async () => {
    const { owner, proxy } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
      startedAt: new Date(),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_vr',
      status: 'pending',
    })

    mockEvent('payment_intent.payment_failed', { id: 'pi_evt_vr' })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('verification_required')
    const mapping = await ctx.prisma.userTaskMapping.findUnique({
      where: { taskId: task.id },
    })
    expect(mapping).not.toBeNull()
    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_evt_vr' },
    })
    expect(payment?.status).toBe('failed')
  })

  it('ignores payment_failed for an already succeeded payment', async () => {
    const { owner, proxy } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_ok',
      status: 'succeeded',
    })

    mockEvent('payment_intent.payment_failed', {
      id: 'pi_evt_ok',
      metadata: meta(task, proxy, task.startedAt as Date),
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_evt_ok' },
    })
    expect(payment?.status).toBe('succeeded')
    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('in_progress')
    const mapping = await ctx.prisma.userTaskMapping.findUnique({
      where: { taskId: task.id },
    })
    expect(mapping).not.toBeNull()
  })

  it('releases the open claim named by metadata when no payment row exists', async () => {
    const { task, proxy, T } = await claimedTask()

    mockEvent('payment_intent.payment_failed', {
      id: 'pi_evt_fail',
      metadata: meta(task, proxy, T),
    })

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
    expect(
      await ctx.prisma.payments.count({ where: { taskId: task.id } }),
    ).toBe(0)
  })

  it('ignores payment_failed metadata for a claim that is no longer open', async () => {
    const { task, proxy, T } = await claimedTask()

    mockEvent('payment_intent.payment_failed', {
      id: 'pi_evt_stale',
      metadata: meta(task, proxy, new Date(T.getTime() - 60_000)),
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('in_progress')
    expect(updatedTask?.startedAt?.getTime()).toBe(T.getTime())
    const mapping = await ctx.prisma.userTaskMapping.findUnique({
      where: { taskId: task.id },
    })
    expect(mapping).not.toBeNull()
  })

  it('marks payment refunded on a full charge.refunded', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'canceled',
      startedAt: new Date(),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_3',
      status: 'succeeded',
    })

    mockEvent('charge.refunded', {
      payment_intent: 'pi_evt_3',
      amount: 5000,
      amount_refunded: 5000,
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

  it('keeps the stored refundId when charge.refunded has no refunds list', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'canceled',
      startedAt: new Date(),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_kept',
      status: 'succeeded',
      refundId: 're_kept',
    })

    mockEvent('charge.refunded', {
      payment_intent: 'pi_evt_kept',
      amount: 5000,
      amount_refunded: 5000,
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_evt_kept' },
    })
    expect(payment?.status).toBe('refunded')
    expect(payment?.refundId).toBe('re_kept')
  })

  it('does not mark a partial refund as refunded', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_part',
      status: 'succeeded',
    })

    mockEvent('charge.refunded', {
      payment_intent: 'pi_evt_part',
      amount: 5000,
      amount_refunded: 2500,
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_evt_part' },
    })
    expect(payment?.status).toBe('succeeded')
  })

  it('flips stripeAccountReady and clears payoutIssue on account.updated', async () => {
    const proxy = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountId: 'acct_ready',
    })
    await ctx.prisma.users.update({
      where: { id: proxy.id },
      data: { payoutIssue: true },
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
    expect(updated?.payoutIssue).toBe(false)
  })

  it('ignores account.updated without an account id', async () => {
    const a = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-a@test.io',
      userType: 'PROXY',
      stripeAccountId: 'acct_a',
      stripeAccountReady: false,
    })
    const b = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-b@test.io',
      userType: 'PROXY',
      stripeAccountId: 'acct_b',
      stripeAccountReady: false,
    })

    mockEvent('account.updated', {
      charges_enabled: true,
      payouts_enabled: true,
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const users = await ctx.prisma.users.findMany({
      where: { id: { in: [a.id, b.id] } },
    })
    expect(users).toHaveLength(2)
    expect(users.every((u) => u.stripeAccountReady === false)).toBe(true)
  })

  it('flags the proxy on payout.failed without touching tasks or wallet', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner-payout@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-payout@test.io',
      userType: 'PROXY',
      stripeAccountId: 'acct_payout',
    })
    const task = await ctx.prisma.tasks.create({
      data: {
        owner: owner.id,
        title: 'Task',
        description: 'desc',
        locationLat: 0,
        locationLng: 0,
        locationAddress: 'addr',
        city: 'São Paulo',
        state: 'SP',
        offeredPrice: 100,
        proxyEarnings: 75.62,
        platformFee: 20,
        status: 'completed',
        transferId: 'tr_payout_1',
      },
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await ctx.prisma.users.update({
      where: { id: proxy.id },
      data: { walletBalance: 200, totalTasksCompleted: 3 },
    })

    ctx.stripeMock.constructWebhookEvent.mockReturnValueOnce({
      id: 'evt_payout_failed_1',
      type: 'payout.failed',
      account: 'acct_payout',
      data: {
        object: { id: 'po_payout_1', failure_code: 'account_closed' },
      },
    } as unknown as Stripe.Event)

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const updatedProxy = await ctx.prisma.users.findUnique({
      where: { id: proxy.id },
    })
    expect(updatedProxy?.payoutIssue).toBe(true)
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('200.00')
    expect(updatedProxy?.totalTasksCompleted).toBe(3)

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.transferId).toBe('tr_payout_1')
  })

  it('persists the dispute and freezes the payment on charge.dispute.created', async () => {
    const { owner, proxy } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'completed',
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await ctx.prisma.users.update({
      where: { id: proxy.id },
      data: { walletBalance: 100 },
    })
    await createPayment(ctx.prisma, task.id, {
      status: 'succeeded',
      paymentIntent: 'pi_disp',
    })

    mockEvent('charge.dispute.created', {
      id: 'dp_1',
      payment_intent: 'pi_disp',
    })

    const response = await postWebhook()
    expect(response.status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_disp' },
    })
    expect(payment?.status).toBe('disputed')
    expect(payment?.disputeId).toBe('dp_1')

    const updatedProxy = await ctx.prisma.users.findUnique({
      where: { id: proxy.id },
    })
    expect(updatedProxy?.walletBalance.toFixed(2)).toBe('100.00')
  })

  it('is idempotent for a second dispute event on the same payment', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'completed',
    })
    await createPayment(ctx.prisma, task.id, {
      status: 'succeeded',
      paymentIntent: 'pi_disp2',
    })

    mockEvent(
      'charge.dispute.created',
      { id: 'dp_1', payment_intent: 'pi_disp2' },
      'evt_disp_a',
    )
    expect((await postWebhook()).status).toBe(200)
    mockEvent(
      'charge.dispute.created',
      { id: 'dp_2', payment_intent: 'pi_disp2' },
      'evt_disp_b',
    )
    expect((await postWebhook()).status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_disp2' },
    })
    expect(payment?.status).toBe('disputed')
    expect(payment?.disputeId).toBe('dp_1')
  })

  it('keeps a disputed payment disputed on a full charge.refunded', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'completed',
    })
    await createPayment(ctx.prisma, task.id, {
      status: 'disputed',
      paymentIntent: 'pi_keep',
      disputeId: 'dp_keep',
    })

    mockEvent('charge.refunded', {
      payment_intent: 'pi_keep',
      amount: 5000,
      amount_refunded: 5000,
      refunds: { data: [{ id: 're_keep' }] },
    })

    expect((await postWebhook()).status).toBe(200)

    const payment = await ctx.prisma.payments.findFirst({
      where: { paymentIntent: 'pi_keep' },
    })
    expect(payment?.status).toBe('disputed')
    expect(payment?.disputeId).toBe('dp_keep')
  })

  it('processes the same event only once, even concurrently', async () => {
    const { owner } = await seedUsers()
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: 'pi_evt_idem',
      status: 'pending',
    })

    ctx.stripeMock.constructWebhookEvent.mockReturnValue({
      id: 'evt_idem',
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_evt_idem', amount: 5000, latest_charge: 'ch_idem' },
      },
    } as unknown as Stripe.Event)

    const [a, b] = await Promise.all([postWebhook(), postWebhook()])

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(await ctx.prisma.stripeEvents.count()).toBe(1)
    const payment = await ctx.prisma.payments.findUnique({
      where: { paymentIntent: 'pi_evt_idem' },
    })
    expect(payment?.status).toBe('succeeded')
  })
})
