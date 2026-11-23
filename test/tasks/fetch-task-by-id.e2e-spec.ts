import request from 'supertest'
import { JwtService } from '@nestjs/jwt'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { buildSessionPayload } from 'src/modules/auth/utils/session-payload'
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
      name: owner.name,
    })
    expect(response.body.ownerId).not.toHaveProperty('email')
    expect(response.body.ownerId).not.toHaveProperty('stripeCustomerId')
    expect(response.body.payment).toBeNull()
    expect(response.body.chargedAmount).toBe(50)
    expect(response.body.stripeFee).toBe(2.39)
    expect(response.body.platformFee).toBe(10)
    expect(response.body.proxyEarnings).toBe(40)
    expect(response.body).not.toHaveProperty('platformNet')
  })

  it('includes completedAt and canceledAt', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'completed',
      completedAt: new Date('2026-11-01T10:00:00Z'),
    })

    const response = await request(ctx.app.getHttpServer())
      .get(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${owner.token}`)

    expect(response.status).toBe(200)
    expect(response.body.completedAt).toBe('2026-11-01T10:00:00.000Z')
    expect(response.body.canceledAt).toBeNull()
  })

  it('does not collide with GET /tasks/fetch', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/fetch?city=SP')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.items)).toBe(true)
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

  it('lets a PROXY view an available task they do not own', async () => {
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
    await ctx.prisma.payments.create({
      data: { taskId: task.id, paymentIntent: 'pi_hidden', amount: 50 },
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
    expect(response.body.ownerId).not.toHaveProperty('phoneNumber')
    expect(response.body.payment).toBeNull()
    expect(JSON.stringify(response.body)).not.toContain('pi_hidden')
  })

  it('returns 404 to a stranger PROXY on a non-available task', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const stranger = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
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

  const seedMapped = async (status: 'in_progress' | 'completed') => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      phoneNumber: '+5511911111111',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      phoneNumber: '+5511922222222',
    })
    const task = await createTask(ctx.prisma, owner.id, { status })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    return { owner, proxy, task }
  }

  const get = (id: string, token: string) =>
    request(ctx.app.getHttpServer())
      .get(`/tasks/${id}`)
      .set('Authorization', `Bearer ${token}`)

  it('lets the mapped executor read an in_progress task with the owner phone', async () => {
    const { owner, proxy, task } = await seedMapped('in_progress')
    await ctx.prisma.payments.create({
      data: { taskId: task.id, paymentIntent: 'pi_exec', amount: 50 },
    })

    const response = await get(task.id, proxy.token)

    expect(response.status).toBe(200)
    expect(response.body.executorId).toBe(proxy.id)
    expect(response.body.ownerId.phoneNumber).toBe(owner.phoneNumber)
    expect(response.body.payment).toBeNull()
  })

  it('hides the owner phone from the executor once the task is completed', async () => {
    const { proxy, task } = await seedMapped('completed')

    const response = await get(task.id, proxy.token)

    expect(response.status).toBe(200)
    expect(response.body.ownerId).not.toHaveProperty('phoneNumber')
  })

  it('shows the executor phone to the owner only while in progress', async () => {
    const live = await seedMapped('in_progress')
    const liveResponse = await get(live.task.id, live.owner.token)
    expect(liveResponse.status).toBe(200)
    expect(liveResponse.body.executor.phoneNumber).toBe(live.proxy.phoneNumber)

    const done = await seedMapped('completed')
    const doneResponse = await get(done.task.id, done.owner.token)
    expect(doneResponse.status).toBe(200)
    expect(doneResponse.body.executor).not.toHaveProperty('phoneNumber')
  })

  it('embeds the payment for the owner without Stripe ids and with a numeric amount', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
    })
    await ctx.prisma.payments.create({
      data: {
        taskId: task.id,
        paymentIntent: 'pi_test_in_progress',
        chargeId: 'ch_test_1',
        disputeId: 'dp_test_1',
        amount: 50,
        status: 'pending',
      },
    })

    const response = await get(task.id, owner.token)

    expect(response.status).toBe(200)
    expect(response.body.payment).toMatchObject({
      taskId: task.id,
      status: 'pending',
      amount: 50,
    })
    expect(typeof response.body.payment.amount).toBe('number')
    expect(response.body.payment).not.toHaveProperty('paymentIntent')
    expect(response.body.payment).not.toHaveProperty('chargeId')
    expect(response.body.payment).not.toHaveProperty('disputeId')
  })

  it('lets the executor read a completed task whose owner deleted the account', async () => {
    const { owner, proxy, task } = await seedMapped('completed')
    await ctx.prisma.users.update({
      where: { id: owner.id },
      data: { isDeleted: true, name: 'Conta removida' },
    })

    const response = await get(task.id, proxy.token)

    expect(response.status).toBe(200)
    expect(response.body.ownerId.name).toBe('Conta removida')
  })

  it('uses the role stored in the database, not the token', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const client = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id, { status: 'available' })
    const row = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: client.id },
    })
    const forged = await ctx.app
      .get(JwtService)
      .signAsync({ ...buildSessionPayload(row), userType: 'PROXY' })

    const response = await get(task.id, forged)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
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
