import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /tasks/:id (e2e)', () => {
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
      '/tasks/any-id',
    )

    expect(response.status).toBe(401)
  })

  it('returns 404 when the task does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('returns the task details regardless of status', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      title: 'Task em andamento',
    })

    const response = await request(ctx.app.getHttpServer())
      .get(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: task.id,
      title: 'Task em andamento',
      status: 'in_progress',
      owner: owner.id,
    })
    expect(response.body.ownerId).toMatchObject({
      id: owner.id,
      email: owner.email,
    })
    expect(response.body.payment).toBeNull()
  })

  it('includes the payment record on the response when present', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
    })
    await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_test_in_progress',
        amount: 50,
        status: 'pending',
      },
    })

    const response = await request(ctx.app.getHttpServer())
      .get(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body.payment).toMatchObject({
      taskId: task.id,
      paymentIntent: 'pi_test_in_progress',
      status: 'pending',
    })
  })

  it('does not collide with GET /tasks/fetch', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=SP')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
  })

  it('returns 404 when a CLIENT tries to view another user\'s task', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner-fetch@test.io',
    })
    const stranger = await createUser(ctx.app, ctx.prisma, {
      email: 'stranger-fetch@test.io',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
    })

    const response = await request(ctx.app.getHttpServer())
      .get(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('lets a PROXY view any task, even one they do not own', async () => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'client-fetch-proxy@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy-fetch@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'available',
      title: 'Tarefa para o Proxy inspecionar',
    })

    const response = await request(ctx.app.getHttpServer())
      .get(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${proxy.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: task.id,
      title: 'Tarefa para o Proxy inspecionar',
      status: 'available',
      owner: owner.id,
    })
  })

  it('returns 400 VALIDATION_FAILED for a non-UUID id', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/not-a-uuid')
      .set('Authorization', `Bearer ${user.token}`)
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })
})
