import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/forgot-password (e2e)', () => {
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

  const silentMessage = 'Se o email existir, um código de recuperação será enviado.'

  it('returns a silent message when the user does not exist', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'missing@test.io' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: silentMessage })
    expect(ctx.notificationMock.sendResetCodeByEmail).not.toHaveBeenCalled()

    const codes = await ctx.prisma.passwordResetCodes.findMany()
    expect(codes).toHaveLength(0)
  })

  it('persists a hashed reset code and sends it by email when the user exists', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      email: 'user@test.io',
      name: 'Real User',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'user@test.io' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: silentMessage })

    const codes = await ctx.prisma.passwordResetCodes.findMany({
      where: { userId: user.id },
    })
    expect(codes).toHaveLength(1)
    expect(codes[0].used).toBe(false)
    expect(codes[0].expiresAt.getTime()).toBeGreaterThan(Date.now())

    expect(ctx.notificationMock.sendResetCodeByEmail).toHaveBeenCalledTimes(1)
    const [emailArg, plainCode, nameArg] =
      ctx.notificationMock.sendResetCodeByEmail.mock.calls[0]
    expect(emailArg).toBe('user@test.io')
    expect(nameArg).toBe('Real User')
    expect(plainCode).toMatch(/^\d{6}$/)
  })

  it('returns 429 after 3 requests within the rate limit window', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      email: 'rate@test.io',
    })

    for (let i = 0; i < 3; i++) {
      await ctx.prisma.passwordResetCodes.create({
        data: {
          userId: user.id,
          code: 'hashed',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      })
    }

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'rate@test.io' })

    expect(response.status).toBe(429)
    expect(response.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_TOO_MANY_REQUESTS',
    })
  })
})
