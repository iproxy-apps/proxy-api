import request from 'supertest'
import { hash } from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /auth/session/refresh (e2e)', () => {
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

  const refresh = async (token: string) =>
    request(ctx.app.getHttpServer())
      .get('/auth/session/refresh')
      .set('Authorization', `Bearer ${token}`)

  const decode = (session: string) =>
    ctx.app.get(JwtService).decode(session) as Record<string, unknown>

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/auth/session/refresh',
    )

    expect(response.status).toBe(401)
  })

  it('returns a new session for a user without phone number', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { phoneNumber: null })

    const response = await refresh(user.token)

    expect(response.status).toBe(200)
    expect(decode(response.body.session).phoneNumber).toBeNull()
  })

  it('signs rating and walletBalance as numbers', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.users.update({
      where: { id: user.id },
      data: { rating: 4.5, walletBalance: 123.45 },
    })

    const response = await refresh(user.token)
    const decoded = decode(response.body.session)

    expect(response.status).toBe(200)
    expect(typeof decoded.rating).toBe('number')
    expect(typeof decoded.walletBalance).toBe('number')
    expect(decoded.rating).toBe(4.5)
    expect(decoded.walletBalance).toBe(123.45)
  })

  it('signs payoutIssue and cardActionRequired and no document claims', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.users.update({
      where: { id: user.id },
      data: { cardActionRequired: true },
    })

    const response = await refresh(user.token)
    const decoded = decode(response.body.session)

    expect(response.status).toBe(200)
    expect(decoded.cardActionRequired).toBe(true)
    expect(decoded.payoutIssue).toBe(false)
    expect(decoded).not.toHaveProperty('documentType')
    expect(decoded).not.toHaveProperty('documentUrl')
    expect(decoded).not.toHaveProperty('isVerified')
  })

  it('re-signs the access token without issuing a refresh token', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await refresh(user.token)

    expect(response.status).toBe(200)
    expect(Object.keys(response.body)).toEqual(['session'])
  })

  it('does not extend exp', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const before = decode(user.token).exp as number

    const response = await refresh(user.token)
    const after = decode(response.body.session).exp as number

    expect(response.status).toBe(200)
    expect(after).toBeLessThanOrEqual(before)
    expect(before - after).toBeLessThanOrEqual(5)
  })

  it('a token issued before a password reset still expires at its original exp and cannot be renewed past it', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: user.email, password: 'password123' })
    const old = login.body.session as string
    const oldExp = decode(old).exp as number
    await ctx.prisma.passwordResetCodes.create({
      data: {
        userId: user.id,
        code: await hash('654321', 8),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        state: 'verified',
      },
    })
    const reset = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email: user.email, code: '654321', newPassword: 'new-password' })
    expect(reset.status).toBe(200)

    const response = await refresh(old)

    expect(response.status).toBe(200)
    expect(decode(response.body.session).exp as number).toBeLessThanOrEqual(
      oldExp,
    )
    const second = await refresh(response.body.session)
    expect(decode(second.body.session).exp as number).toBeLessThanOrEqual(
      oldExp,
    )
  })
})
