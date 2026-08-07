import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /tasks/active (e2e)', () => {
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
    const response = await request(ctx.app.getHttpServer()).get('/tasks/active')

    expect(response.status).toBe(401)
  })

  it('returns an empty list when the user has no active tasks', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/active')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('returns owner tasks in any non-terminal status (including available)', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const available = await createTask(ctx.prisma, owner.id, {
      status: 'available',
    })
    const inProgress = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
    })
    const verificationRequired = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
    })
    // Terminal statuses → excluded
    await createTask(ctx.prisma, owner.id, { status: 'completed' })
    await createTask(ctx.prisma, owner.id, { status: 'canceled' })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/active')
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(3)
    const ids = response.body.map((t: { id: string }) => t.id).sort()
    expect(ids).toEqual(
      [available.id, inProgress.id, verificationRequired.id].sort(),
    )
  })

  it('returns tasks the user accepted as an executor', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner-active@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-active@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/active')
      .set('Authorization', `Bearer ${proxy.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0]).toMatchObject({
      id: task.id,
      status: 'in_progress',
      owner: owner.id,
    })
  })

  it('does not collide with GET /tasks/:id or /tasks/fetch', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const fetchResponse = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=SP')
      .set('Authorization', `Bearer ${user.token}`)
    expect(fetchResponse.status).toBe(200)
    expect(Array.isArray(fetchResponse.body)).toBe(true)

    const missingByIdResponse = await request(ctx.app.getHttpServer())
      .get('/tasks/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${user.token}`)
    expect(missingByIdResponse.status).toBe(404)
  })
})
