import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('DELETE /auth/account (e2e)', () => {
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
    const response = await request(ctx.app.getHttpServer()).delete(
      '/auth/account',
    )

    expect(response.status).toBe(401)
  })

  it('blocks deletion when the user has active tasks as owner', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await createTask(ctx.prisma, user.id, { status: 'in_progress' })
    const listingId = (
      await createTask(ctx.prisma, user.id, { status: 'available' })
    ).id

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'USER_HAS_ACTIVE_TASKS' })

    const stored = await ctx.prisma.users.findUnique({ where: { id: user.id } })
    expect(stored?.isDeleted).toBe(false)
    const listing = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: listingId },
    })
    expect(listing.status).toBe('available')
  })

  it('blocks deletion when the user has active tasks as executor', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner-del@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-del@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${proxy.token}`)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'USER_HAS_ACTIVE_TASKS' })
  })

  it('blocks when the user executes a task in verification_required', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner-ver@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-ver@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${proxy.token}`)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'USER_HAS_ACTIVE_TASKS' })
  })

  it('soft-deletes the account and anonymizes PII', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)

    const stored = await ctx.prisma.users.findUnique({ where: { id: user.id } })
    expect(stored?.isDeleted).toBe(true)
    expect(stored?.name).toBe('Conta removida')
    expect(stored?.email).toBe(`deleted-${user.id}@deleted.local`)
    expect(stored?.phoneNumber).toBeNull()
    expect(stored?.avatarUrl).toBeNull()
    expect(stored?.password).toBe('!deleted')
  })

  it('soft-deletes cards, detaches them on Stripe and scrubs the customer', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.cards.create({
      data: {
        userId: user.id,
        stripeCardId: 'pm_del_1',
        brand: 'visa',
        last4: '4242',
      },
    })

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)
    const card = await ctx.prisma.cards.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(card.isDeleted).toBe(true)
    expect(ctx.stripeMock.detachPaymentMethod).toHaveBeenCalledWith('pm_del_1')
    expect(ctx.stripeMock.scrubCustomer).toHaveBeenCalledWith(
      'cus_test_default',
    )
    const stored = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.stripeCustomerId).toBe('cus_test_default')
    expect(stored.deletedAt).not.toBeNull()
  })

  it('still deletes when Stripe detach fails', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.cards.create({
      data: {
        userId: user.id,
        stripeCardId: 'pm_del_2',
        brand: 'visa',
        last4: '4242',
      },
    })
    ctx.stripeMock.detachPaymentMethod.mockRejectedValueOnce(new Error('boom'))

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)
    const stored = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.isDeleted).toBe(true)
  })

  it('revokes every refresh token', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      email: 'rt-del@test.io',
    })
    const login = () =>
      request(ctx.app.getHttpServer())
        .post('/auth/session')
        .send({ email: user.email, password: 'password123' })
    const first = await login()
    const second = await login()
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)
    expect(
      await ctx.prisma.refreshTokens.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0)
    for (const r of [first, second]) {
      const refreshed = await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: r.body.refreshToken })
      expect(refreshed.status).toBe(401)
    }
  })

  it('rejects subsequent requests with the same token after deletion', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/transaction-history')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(401)
  })

  it('cancels open listings and deletes the account', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const completed = await createTask(ctx.prisma, user.id, {
      status: 'completed',
    })
    const canceled = await createTask(ctx.prisma, user.id, {
      status: 'canceled',
    })
    const available = await createTask(ctx.prisma, user.id, {
      status: 'available',
    })

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)
    const after = await ctx.prisma.tasks.findMany({
      where: { owner: user.id },
    })
    const byId = new Map(after.map((t) => [t.id, t]))
    expect(byId.get(available.id)?.status).toBe('canceled')
    expect(byId.get(available.id)?.canceledAt).not.toBeNull()
    expect(byId.get(completed.id)?.status).toBe('completed')
    expect(byId.get(canceled.id)?.status).toBe('canceled')
  })

  it('a task created concurrently with the deletion never survives as available', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.cards.create({
      data: {
        userId: user.id,
        stripeCardId: 'pm_owner',
        brand: 'visa',
        last4: '4242',
      },
    })
    const body = {
      cardDetails: { savedCard: 'pm_owner' },
      title: 'Comprar mantimentos',
      description: 'Ir ao mercado e trazer os itens da lista',
      address: {
        state: 'SP',
        city: 'São Paulo',
        locationLat: -23.55,
        locationLng: -46.63,
        street: 'Rua A, 123',
        zipCode: '01000-000',
      },
      pricing: { offeredPrice: 50 },
    }

    const [created, deleted] = await Promise.all([
      request(ctx.app.getHttpServer())
        .post('/tasks/create')
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
      request(ctx.app.getHttpServer())
        .delete('/auth/account')
        .set('Authorization', `Bearer ${user.token}`),
    ])

    expect([200, 201, 404, 401]).toContain(created.status)
    expect([200, 204, 409]).toContain(deleted.status)
    if (deleted.status === 409) return
    expect(
      await ctx.prisma.tasks.count({
        where: { owner: user.id, status: 'available' },
      }),
    ).toBe(0)
    if (created.status >= 400) {
      expect(await ctx.prisma.tasks.count({ where: { owner: user.id } })).toBe(
        0,
      )
    }
  })
})
