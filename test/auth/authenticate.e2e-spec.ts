import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/session (e2e)', () => {
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

  it('rejects malformed emails', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: 'not-an-email', password: 'x' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  it('returns 404 when the user does not exist', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: 'missing@test.io', password: 'whatever' })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_FOUND' })
  })

  it('returns 401 when the password does not match', async () => {
    await createUser(ctx.app, ctx.prisma, {
      email: 'user@test.io',
      password: 'correct-password',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: 'user@test.io', password: 'wrong-password' })

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      errorCode: 'USER_INVALID_CREDENTIALS',
    })
  })

  it('returns a signed session on valid credentials', async () => {
    await createUser(ctx.app, ctx.prisma, {
      email: 'user@test.io',
      password: 'correct-password',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: 'user@test.io', password: 'correct-password' })

    expect(response.status).toBe(200)
    expect(typeof response.body.session).toBe('string')
    expect(response.body.session.split('.')).toHaveLength(3) // JWT shape
  })
})
