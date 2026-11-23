import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTask } from '../factories/task.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /auth/transaction-history (e2e)', () => {
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
    const response = await request(ctx.app.getHttpServer()).get(
      '/auth/transaction-history',
    )

    expect(response.status).toBe(401)
  })

  it('returns the empty shape', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/transaction-history')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      tasksCreated: [],
      tasksCompleted: [],
      page: 1,
      perPage: 20,
      hasMore: false,
    })
  })

  it('lists tasks created by the user and lists the executed ones', async () => {
    const client = await createUser(ctx.app, ctx.prisma, {
      email: 'client@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })

    // Task owned by client (still open)
    await ctx.prisma.tasks.create({
      data: {
        owner: client.id,
        title: 'Open task',
        description: 'desc',
        locationLat: 0,
        locationLng: 0,
        locationAddress: 'addr',
        city: 'São Paulo',
        state: 'SP',
        offeredPrice: 200,
      },
    })

    // Completed task where proxy was the executor
    const completedTask = await ctx.prisma.tasks.create({
      data: {
        owner: client.id,
        title: 'Completed task',
        description: 'desc',
        locationLat: 0,
        locationLng: 0,
        locationAddress: 'addr',
        city: 'São Paulo',
        state: 'SP',
        offeredPrice: 100,
        status: 'completed',
        completedAt: new Date(),
      },
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: completedTask.id, executorId: proxy.id },
    })

    const clientResponse = await request(ctx.app.getHttpServer())
      .get('/auth/transaction-history')
      .set('Authorization', `Bearer ${client.token}`)

    expect(clientResponse.status).toBe(200)
    expect(clientResponse.body.tasksCreated).toHaveLength(2)
    expect(clientResponse.body.tasksCompleted).toHaveLength(0)

    const proxyResponse = await request(ctx.app.getHttpServer())
      .get('/auth/transaction-history')
      .set('Authorization', `Bearer ${proxy.token}`)

    expect(proxyResponse.status).toBe(200)
    expect(proxyResponse.body.tasksCompleted).toHaveLength(1)
    // the legacy seed has no stored proxyEarnings
    expect(proxyResponse.body.tasksCompleted[0].netAmount).toBe(0)
  })

  const get = (token: string, query = '') =>
    request(ctx.app.getHttpServer())
      .get(`/auth/transaction-history${query}`)
      .set('Authorization', `Bearer ${token}`)

  const seedExecuted = async (
    ownerId: string,
    executorId: string,
    overrides: Parameters<typeof createTask>[2],
  ) => {
    const task = await createTask(ctx.prisma, ownerId, overrides)
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId },
    })
    return task
  }

  it('uses the stored proxyEarnings as netAmount for executed tasks', async () => {
    const client = await createUser(ctx.app, ctx.prisma, {
      email: 'client@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    await seedExecuted(client.id, proxy.id, {
      offeredPrice: 100,
      status: 'completed',
      completedAt: new Date(),
    })

    const response = await get(proxy.token)

    expect(response.status).toBe(200)
    expect(response.body.tasksCompleted).toHaveLength(1)
    const item = response.body.tasksCompleted[0]
    expect(item.netAmount).toBe(80)
    expect(typeof item.netAmount).toBe('number')
    expect(typeof item.offeredPrice).toBe('number')
    expect(item).not.toHaveProperty('description')
  })

  it('includes canceled and payout_failed executor tasks', async () => {
    const client = await createUser(ctx.app, ctx.prisma, {
      email: 'client@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    await seedExecuted(client.id, proxy.id, {
      status: 'completed',
      completedAt: new Date(),
    })
    await seedExecuted(client.id, proxy.id, {
      status: 'canceled',
      canceledAt: new Date(),
    })
    await seedExecuted(client.id, proxy.id, { status: 'payout_failed' })

    const response = await get(proxy.token)

    expect(response.body.tasksCompleted).toHaveLength(3)
    const byStatus = Object.fromEntries(
      response.body.tasksCompleted.map(
        (t: { status: string; netAmount: number }) => [t.status, t.netAmount],
      ),
    )
    expect(byStatus.canceled).toBe(0)
    expect(byStatus.completed).toBe(40)
    expect(byStatus.payout_failed).toBe(40)
  })

  it('reports chargedAmount as netAmount for the client on completed tasks', async () => {
    const client = await createUser(ctx.app, ctx.prisma, {
      email: 'client@test.io',
    })
    await createTask(ctx.prisma, client.id, {
      title: 'new',
      offeredPrice: 150,
      chargedAmount: 150,
      status: 'completed',
      completedAt: new Date(),
    })
    await createTask(ctx.prisma, client.id, {
      title: 'legacy',
      offeredPrice: 80,
      chargedAmount: null,
      status: 'completed',
      completedAt: new Date(),
    })
    await createTask(ctx.prisma, client.id, {
      title: 'canceled',
      status: 'canceled',
      canceledAt: new Date(),
    })

    const response = await get(client.token)

    const net = Object.fromEntries(
      response.body.tasksCreated.map(
        (t: { title: string; netAmount: number }) => [t.title, t.netAmount],
      ),
    )
    expect(net).toEqual({ new: 150, legacy: 80, canceled: 0 })
  })

  it('paginates with page/perPage/hasMore', async () => {
    const client = await createUser(ctx.app, ctx.prisma, {
      email: 'client@test.io',
    })
    for (let i = 0; i < 21; i++) {
      await createTask(ctx.prisma, client.id, { title: `t-${i}` })
    }

    const first = await get(client.token)
    expect(first.body.tasksCreated).toHaveLength(20)
    expect(first.body.hasMore).toBe(true)
    expect(first.body.page).toBe(1)
    expect(first.body.perPage).toBe(20)

    const second = await get(client.token, '?page=2')
    expect(second.body.tasksCreated).toHaveLength(1)
    expect(second.body.hasMore).toBe(false)
    expect(second.body.page).toBe(2)
  })
})
