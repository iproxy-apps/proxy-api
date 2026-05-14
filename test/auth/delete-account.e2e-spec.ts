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

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'USER_HAS_ACTIVE_TASKS' })

    const stored = await ctx.prisma.users.findUnique({ where: { id: user.id } })
    expect(stored?.isDeleted).toBe(false)
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
      status: 'on_the_way',
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
    expect(stored?.documentUrl).toBeNull()
    expect(stored?.documentType).toBeNull()
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

  it('allows completed/canceled tasks (not blocking)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await createTask(ctx.prisma, user.id, { status: 'completed' })
    await createTask(ctx.prisma, user.id, { status: 'canceled' })
    await createTask(ctx.prisma, user.id, { status: 'available' })

    const response = await request(ctx.app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)
  })
})
