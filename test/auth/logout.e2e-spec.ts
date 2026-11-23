import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/logout (e2e)', () => {
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

  const logout = async (body: object) =>
    request(ctx.app.getHttpServer()).post('/auth/logout').send(body)

  it('revokes the family and is idempotent', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: user.email, password: 'password123' })
    const refreshToken = login.body.refreshToken as string

    expect((await logout({ refreshToken })).status).toBe(204)

    const refresh = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
    expect(refresh.status).toBe(401)

    expect((await logout({ refreshToken })).status).toBe(204)
  })

  it('returns 204 for an unknown token', async () => {
    const response = await logout({ refreshToken: 'y'.repeat(43) })

    expect(response.status).toBe(204)
  })

  it('works without an access token', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: 'z'.repeat(43) })

    expect(response.status).toBe(204)
  })

  it('rejects a body without refreshToken', async () => {
    const response = await logout({})

    expect(response.status).toBe(400)
  })
})
