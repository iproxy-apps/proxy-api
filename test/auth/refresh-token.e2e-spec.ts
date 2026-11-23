import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createHash } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'
import { buildSessionPayload } from 'src/modules/auth/utils/session-payload'

import type { TestAppContext } from '../setup/test-app.factory'

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex')

describe('refresh tokens (e2e)', () => {
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

  const login = async (email: string, password = 'password123') =>
    request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email, password })

  const refresh = async (refreshToken: string) =>
    request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })

  const rowOf = async (token: string) =>
    ctx.prisma.refreshTokens.findUniqueOrThrow({
      where: { tokenHash: sha256(token) },
    })

  it('issues a 30-minute access token and an opaque refresh token on login', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })

    const response = await login(user.email)

    expect(response.status).toBe(200)
    const decoded = ctx.app.get(JwtService).decode(response.body.session) as {
      iat: number
      exp: number
    }
    expect(decoded.exp - decoded.iat).toBe(1800)
    expect(response.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const row = await ctx.prisma.refreshTokens.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(row.tokenHash).toBe(sha256(response.body.refreshToken))
    expect(row.tokenHash).not.toBe(response.body.refreshToken)
  })

  it('returns a refresh token on sign-up', async () => {
    const email = `new-${Date.now()}@test.io`

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({
        name: 'New User',
        email,
        password: 'password123',
        userType: 'CLIENT',
        termsAccepted: true,
      })

    expect(response.status).toBe(200)
    expect(typeof response.body.refreshToken).toBe('string')
    const created = await ctx.prisma.users.findUniqueOrThrow({
      where: { email },
    })
    expect(
      await ctx.prisma.refreshTokens.count({ where: { userId: created.id } }),
    ).toBe(1)
  })

  it('rotates the refresh token', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })
    const a = (await login(user.email)).body.refreshToken as string

    const response = await refresh(a)

    expect(response.status).toBe(200)
    expect(typeof response.body.session).toBe('string')
    const b = response.body.refreshToken as string
    expect(b).not.toBe(a)
    const rowA = await rowOf(a)
    const rowB = await rowOf(b)
    expect(rowA.revokedAt).not.toBeNull()
    expect(rowA.replacedById).toBe(rowB.id)
    expect(rowB.familyId).toBe(rowA.familyId)
    const expected = Date.now() + 60 * 24 * 60 * 60 * 1000
    expect(Math.abs(rowB.expiresAt.getTime() - expected)).toBeLessThan(60_000)
  })

  it('revokes the whole family when a rotated token is reused', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })
    const a = (await login(user.email)).body.refreshToken as string
    const b = (await refresh(a)).body.refreshToken as string

    const reuse = await refresh(a)
    expect(reuse.status).toBe(401)
    expect(reuse.body).toMatchObject({ errorCode: 'SESSION_REFRESH_INVALID' })

    const next = await refresh(b)
    expect(next.status).toBe(401)
  })

  it('keeps other devices signed in when one device rotates', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })
    const f1 = (await login(user.email)).body.refreshToken as string
    const f2 = (await login(user.email)).body.refreshToken as string

    const first = await refresh(f1)
    expect(first.status).toBe(200)
    const second = await refresh(first.body.refreshToken)
    expect(second.status).toBe(200)

    expect((await refresh(f2)).status).toBe(200)
  })

  it('rejects an expired refresh token', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })
    const a = (await login(user.email)).body.refreshToken as string
    await ctx.prisma.refreshTokens.update({
      where: { tokenHash: sha256(a) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const response = await refresh(a)

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      errorCode: 'SESSION_REFRESH_INVALID',
    })
  })

  it('rejects an unknown refresh token', async () => {
    const response = await refresh('x'.repeat(43))

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      errorCode: 'SESSION_REFRESH_INVALID',
    })
  })

  it('rejects a malformed body', async () => {
    const empty = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({})
    expect(empty.status).toBe(400)

    const extra = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'x'.repeat(43), extra: 1 })
    expect(extra.status).toBe(400)
  })

  it('rejects refresh for a deleted user', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'a@test.io' })
    const a = (await login(user.email)).body.refreshToken as string
    await ctx.prisma.users.update({
      where: { id: user.id },
      data: { isDeleted: true },
    })

    const response = await refresh(a)

    expect(response.status).toBe(401)
  })

  it('rejects an expired access token', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const row = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    const expired = ctx.app
      .get(JwtService)
      .sign(buildSessionPayload(row), { expiresIn: '-10s' })

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/session/refresh')
      .set('Authorization', `Bearer ${expired}`)

    expect(response.status).toBe(401)
  })

  it('rejects a valid token without exp', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const row = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    const noExp = jwt.sign(
      buildSessionPayload(row),
      Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64'),
      { algorithm: 'RS256' },
    )

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/session/refresh')
      .set('Authorization', `Bearer ${noExp}`)

    expect(response.status).toBe(401)
  })

  it('rejects a legacy token without exp', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const row = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    const legacy = jwt.sign(
      { ...buildSessionPayload(row), rating: '0', documentType: null },
      Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64'),
      { algorithm: 'RS256' },
    )

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/session/refresh')
      .set('Authorization', `Bearer ${legacy}`)

    expect(response.status).toBe(401)
  })
})
