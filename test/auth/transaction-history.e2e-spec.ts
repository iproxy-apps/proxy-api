import request from 'supertest'

import { createUser } from '../factories/user.factory'
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

  it('returns empty lists when the user has no history', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/transaction-history')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ tasksCreated: [], tasksCompleted: [] })
  })

  it('lists tasks created by the user and computes netAmount for completed ones', async () => {
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
    // 100 - (100 * 0.0399 + 0.39) - (100 * 0.2) = 75.62
    expect(proxyResponse.body.tasksCompleted[0].netAmount).toBe(75.62)
  })
})
