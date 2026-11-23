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
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  it('returns an empty list when no tasks exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=SP')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      items: [],
      page: 1,
      perPage: 10,
      hasMore: false,
    })
  })

  it('returns available tasks matching the city filter', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    await createTask(ctx.prisma, owner.id, { locationAddress: 'São Paulo' })
    await createTask(ctx.prisma, owner.id, {
      locationAddress: 'Rio',
      city: 'Rio de Janeiro',
      state: 'RJ',
    })
    // Not available → excluded
    await createTask(ctx.prisma, owner.id, {
      locationAddress: 'São Paulo',
      status: 'in_progress',
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0]).toMatchObject({
      status: 'available',
      locationAddress: 'São Paulo',
    })
  })

  it('exposes only the public owner fields and numeric money', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    await createTask(ctx.prisma, owner.id, { locationAddress: 'São Paulo' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    const [item] = response.body.items
    expect(Object.keys(item.ownerId).sort()).toEqual(
      ['avatarUrl', 'id', 'name', 'rating', 'totalTasksCreated'],
    )
    expect(typeof item.offeredPrice).toBe('number')
    expect(typeof item.ownerId.rating).toBe('number')
  })

  it('returns the empty page shape for an unserved city', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=Curitiba')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      items: [],
      page: 1,
      perPage: 10,
      hasMore: false,
    })
  })

  it('matches the city case- and accent-insensitively', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    await createTask(ctx.prisma, owner.id)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=sao paulo')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body.items[0].city).toBe('São Paulo')
  })

  it('does not match by address substring', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    await createTask(ctx.prisma, owner.id, {
      city: 'Rio de Janeiro',
      state: 'RJ',
      locationAddress: 'Rua São Paulo, Rio de Janeiro - RJ, 20000-000',
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(0)
  })

  it('paginates 11 tasks into 10 + 1 with hasMore', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    for (let i = 0; i < 11; i++) {
      await createTask(ctx.prisma, owner.id, { title: `Task ${i}` })
    }

    const first = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo&page=1')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(first.status).toBe(200)
    expect(first.body.items).toHaveLength(10)
    expect(first.body.hasMore).toBe(true)
    expect(first.body.page).toBe(1)

    const second = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo&page=2')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(second.status).toBe(200)
    expect(second.body.items).toHaveLength(1)
    expect(second.body.hasMore).toBe(false)
    expect(second.body.page).toBe(2)
  })

  it('rejects page=0', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo&page=0')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(400)
  })

  it('rejects an out-of-range page', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo&page=1000000000000')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  it('returns an empty page past the last one', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    await createTask(ctx.prisma, owner.id)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=São Paulo&page=50')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      items: [],
      page: 50,
      perPage: 10,
      hasMore: false,
    })
  })

  it('answers 403 USER_NOT_PROXY to a CLIENT', async () => {
    const client = await createUser(ctx.app, ctx.prisma, { userType: 'CLIENT' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=SP')
      .set('Authorization', `Bearer ${client.token}`)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_PROXY' })
  })
})
