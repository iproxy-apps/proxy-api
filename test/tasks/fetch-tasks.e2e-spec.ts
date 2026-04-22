import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /tasks/fetch (e2e)', () => {
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
      '/tasks/fetch?city=SP',
    )

    expect(response.status).toBe(401)
  })

  it('requires a city query parameter', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
  })

  it('returns an empty list when no tasks exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=SP')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('returns available tasks matching the city filter', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)

    await createTask(ctx.prisma, owner.id, { locationAddress: 'São Paulo' })
    await createTask(ctx.prisma, owner.id, { locationAddress: 'Rio' })
    // Not available → excluded
    await createTask(ctx.prisma, owner.id, {
      locationAddress: 'São Paulo',
      status: 'in_progress',
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0]).toMatchObject({
      status: 'available',
      locationAddress: 'São Paulo',
    })
  })
})
