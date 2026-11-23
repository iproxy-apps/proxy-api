import request from 'supertest'
import { JwtService } from '@nestjs/jwt'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/update-profile (e2e)', () => {
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

  const update = (token: string, body: Record<string, unknown>) =>
    request(ctx.app.getHttpServer())
      .post('/auth/update-profile')
      .set('Authorization', `Bearer ${token}`)
      .send(body)

  const rowOf = (id: string) =>
    ctx.prisma.users.findUniqueOrThrow({ where: { id } })

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/update-profile')
      .send({ name: 'Ana' })

    expect(response.status).toBe(401)
  })

  it('updates name and phone and returns a re-signed access token', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { name: 'Old Name' })

    const response = await update(user.token, {
      name: 'Ana Maria',
      phoneNumber: '11988887777',
    })

    expect(response.status).toBe(200)
    expect(Object.keys(response.body)).toEqual(['session'])
    const row = await rowOf(user.id)
    expect(row.name).toBe('Ana Maria')
    expect(row.phoneNumber).toBe('11988887777')
    const decoded = ctx.app.get(JwtService).decode(response.body.session) as {
      name: string
    }
    expect(decoded.name).toBe('Ana Maria')
  })

  it('trims the name', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await update(user.token, { name: '  Ana  ' })

    expect(response.status).toBe(200)
    expect((await rowOf(user.id)).name).toBe('Ana')
  })

  it('clears phoneNumber when null is sent', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await update(user.token, { phoneNumber: null })

    expect(response.status).toBe(200)
    expect((await rowOf(user.id)).phoneNumber).toBeNull()
  })

  it('rejects userType in the body', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await update(user.token, {
      name: 'Ana',
      userType: 'PROXY',
    })

    expect(response.status).toBe(400)
    expect((await rowOf(user.id)).userType).toBe('CLIENT')
  })

  it('rejects password, email and avatarUrl', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const before = await rowOf(user.id)

    for (const extra of [
      { password: 'brand-new-pass' },
      { email: 'other@test.io' },
      { avatarUrl: 'https://example.com/a.png' },
    ]) {
      const response = await update(user.token, { name: 'Ana', ...extra })
      expect(response.status).toBe(400)
    }

    const after = await rowOf(user.id)
    expect(after.password).toBe(before.password)
    expect(after.email).toBe(before.email)
    expect(after.name).toBe(before.name)
  })

  it('rejects an empty body', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await update(user.token, {})

    expect(response.status).toBe(400)
  })

  it('rejects a one-letter name', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await update(user.token, { name: 'A' })

    expect(response.status).toBe(400)
  })

  it('keeps the refresh token valid', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: user.email, password: 'password123' })
    expect(login.status).toBe(200)

    const response = await update(login.body.session, { name: 'Ana Maria' })
    expect(response.status).toBe(200)

    const refreshed = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
    expect(refreshed.status).toBe(200)
  })

  it('does not extend exp', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const jwt = ctx.app.get(JwtService)
    const before = (jwt.decode(user.token) as { exp: number }).exp

    const response = await update(user.token, { name: 'Ana Maria' })
    const after = (jwt.decode(response.body.session) as { exp: number }).exp

    expect(response.status).toBe(200)
    expect(after).toBeLessThanOrEqual(before)
    expect(before - after).toBeLessThanOrEqual(5)
  })
})
