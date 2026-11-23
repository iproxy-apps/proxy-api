import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('/__test hooks (e2e)', () => {
  let ctx: TestAppContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
    process.env.LOOP_TEST_HOOKS = '1'
  })

  afterEach(() => {
    delete process.env.LOOP_TEST_HOOKS
  })

  it('returns 404 when the flag is off', async () => {
    process.env.LOOP_TEST_HOOKS = '0'

    const res = await request(ctx.app.getHttpServer()).post('/__test/reset')

    expect(res.status).toBe(404)
  })

  it('refuses a non-local DATABASE_URL', async () => {
    const original = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://u:p@db.example.com:5432/proxy'
    await createUser(ctx.app, ctx.prisma)

    const res = await request(ctx.app.getHttpServer()).post('/__test/reset')
    process.env.DATABASE_URL = original

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ errorCode: 'TEST_HOOKS_FORBIDDEN' })
    expect(await ctx.prisma.users.count()).toBe(1)
  })

  it('reset truncates every table', async () => {
    await createUser(ctx.app, ctx.prisma)

    const res = await request(ctx.app.getHttpServer()).post('/__test/reset')

    expect(res.status).toBe(204)
    expect(await ctx.prisma.users.count()).toBe(0)
  })

  it('seed-user creates a user that can sign in', async () => {
    const seed = await request(ctx.app.getHttpServer())
      .post('/__test/seed-user')
      .send({
        email: 'cliente@loop.test',
        password: 'senha12345',
        userType: 'CLIENT',
      })

    expect(seed.status).toBe(201)
    expect(seed.body).toMatchObject({ email: 'cliente@loop.test' })

    const session = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: 'cliente@loop.test', password: 'senha12345' })

    expect(session.status).toBe(200)
  })

  it('seed-user rejects a duplicate email with 409', async () => {
    const body = {
      email: 'dup@loop.test',
      password: 'senha12345',
      userType: 'PROXY',
    }
    await request(ctx.app.getHttpServer()).post('/__test/seed-user').send(body)

    const res = await request(ctx.app.getHttpServer())
      .post('/__test/seed-user')
      .send(body)

    expect(res.status).toBe(409)
  })

  it('mark-account-ready flips the flag and sets an account id', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountReady: false,
    })

    const res = await request(ctx.app.getHttpServer())
      .post('/__test/mark-account-ready')
      .send({ email: user.email })

    expect(res.status).toBe(204)

    const row = await ctx.prisma.users.findUniqueOrThrow({
      where: { email: user.email },
    })
    expect(row).toMatchObject({
      stripeAccountReady: true,
      stripeAccountId: 'acct_test_ready',
    })
  })

  it('mark-account-ready returns 404 for an unknown email', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/__test/mark-account-ready')
      .send({ email: 'ghost@loop.test' })

    expect(res.status).toBe(404)
  })
})
