import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/finish (e2e)', () => {
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

  const seedInProgressTask = async () => {
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
    return { owner, proxy, task }
  }

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .field('taskId', 'task-1')

    expect(response.status).toBe(401)
  })

  it('returns 404 when the task does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${user.token}`)
      .field('taskId', '00000000-0000-0000-0000-000000000000')

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('rejects when the caller is not the executor', async () => {
    const { task } = await seedInProgressTask()
    const other = await createUser(ctx.app, ctx.prisma, {
      email: 'other@test.io',
      userType: 'PROXY',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${other.token}`)
      .field('taskId', task.id)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_FINISH_TASK' })
  })

  it('marks the task as verification_required without a proof file', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)

    expect(response.status).toBe(200)

    const updated = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(updated?.status).toBe('verification_required')
    expect(updated?.proofImageUrl).toBeNull()
    expect(updated?.completedAt).not.toBeNull()
  })

  it('rejects a proof above 10 MB with a Portuguese 413', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })

    expect(response.status).toBe(413)
    expect(response.body).toMatchObject({
      errorCode: 'FILE_TOO_LARGE',
      message: 'Arquivo muito grande. O limite é 10 MB.',
    })

    const stored = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(stored?.status).toBe('in_progress')
  })
})
