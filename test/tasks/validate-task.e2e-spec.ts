import request from 'supertest'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/validate (e2e)', () => {
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

  const seedTaskPendingValidation = async (offeredPrice = 100) => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
      startedAt: new Date(),
      completedAt: new Date(),
      offeredPrice,
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    return { owner, proxy, task }
  }

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .send({ taskId: 'task-1' })

    expect(response.status).toBe(401)
  })

  it('returns 404 when the task does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ taskId: '00000000-0000-0000-0000-000000000000' })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('rejects when the caller is not the task owner', async () => {
    const { task } = await seedTaskPendingValidation()
    const other = await createUser(ctx.app, ctx.prisma, {
      email: 'other@test.io',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_VALIDATE_TASK' })
  })

  it('completes the task, pays the executor and increments their counter', async () => {
    const { owner, proxy, task } = await seedTaskPendingValidation(100)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ taskId: task.id })

    expect(response.status).toBe(200)

    const updatedTask = await ctx.prisma.tasks.findUnique({
      where: { id: task.id },
    })
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.completedAt).not.toBeNull()

    const updatedProxy = await ctx.prisma.users.findUnique({
      where: { id: proxy.id },
    })
    expect(updatedProxy?.totalTasksCompleted).toBe(1)
    // 100 - (100 * 0.0399 + 0.39) - (100 * 0.2) = 75.62
    expect(Number(updatedProxy?.walletBalance)).toBeCloseTo(75.62, 2)
  })
})
