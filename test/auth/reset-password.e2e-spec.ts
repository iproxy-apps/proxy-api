import request from 'supertest'
import { compare, hash } from 'bcryptjs'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/reset-password (e2e)', () => {
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

  const insertCode = async (
    userId: string,
    plaintext: string,
    overrides: { state?: 'pending' | 'verified' | 'used' } = {},
  ) => {
    return ctx.prisma.passwordResetCodes.create({
      data: {
        userId,
        code: await hash(plaintext, 8),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        state: overrides.state ?? 'verified',
      },
    })
  }

  it('returns invalidOrExpiredCode when the code has not been verified yet', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    await insertCode(user.id, '654321', { state: 'pending' })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'my-new-password',
      })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('returns invalidOrExpiredCode when the code does not match', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    await insertCode(user.id, '111111')

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '999999',
        newPassword: 'new-password',
      })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('updates the password and atomically marks the code as used', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const code = await insertCode(user.id, '654321')

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'my-new-password',
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Senha redefinida com sucesso.',
    })

    const updatedUser = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updatedUser?.password).not.toBe('my-new-password')
    await expect(
      compare('my-new-password', updatedUser!.password),
    ).resolves.toBe(true)

    const updatedCode = await ctx.prisma.passwordResetCodes.findUnique({
      where: { id: code.id },
    })
    expect(updatedCode?.state).toBe('used')
  })

  it('rejects reuse of a code that has already been used to reset the password', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    await insertCode(user.id, '654321')

    // First reset succeeds.
    const first = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'first-password',
      })
    expect(first.status).toBe(200)

    // Second reset with the same code MUST fail.
    const second = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'second-password',
      })
    expect(second.status).toBe(400)
    expect(second.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })

    // The password must still be the FIRST one.
    const updatedUser = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    await expect(
      compare('first-password', updatedUser!.password),
    ).resolves.toBe(true)
    await expect(
      compare('second-password', updatedUser!.password),
    ).resolves.toBe(false)
  })

  it('revokes every refresh token on reset', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const login = async (password: string) =>
      request(ctx.app.getHttpServer())
        .post('/auth/session')
        .send({ email: user.email, password })
    const first = (await login('password123')).body.refreshToken as string
    const second = (await login('password123')).body.refreshToken as string
    await insertCode(user.id, '654321')

    const reset = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'my-new-password',
      })
    expect(reset.status).toBe(200)

    for (const refreshToken of [first, second]) {
      const response = await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
      expect(response.status).toBe(401)
    }
    expect(
      await ctx.prisma.refreshTokens.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0)

    const fresh = await login('my-new-password')
    expect(fresh.status).toBe(200)
    expect(typeof fresh.body.refreshToken).toBe('string')
  })

  it('a password reset leaves no live refresh token even when a rotation is in flight', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/session')
      .send({ email: user.email, password: 'password123' })
    const old = login.body.refreshToken as string
    await insertCode(user.id, '654321')

    const [rotation] = await Promise.all([
      request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: old }),
      request(ctx.app.getHttpServer()).post('/auth/reset-password').send({
        email: user.email,
        code: '654321',
        newPassword: 'my-new-password',
      }),
    ])

    expect(
      await ctx.prisma.refreshTokens.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0)
    const tokens = [old]
    if (rotation.status === 200) tokens.push(rotation.body.refreshToken)
    for (const refreshToken of tokens) {
      const response = await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
      expect(response.status).toBe(401)
    }
  })

  it('rejects the right code after 5 wrong reset attempts', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    await insertCode(user.id, '654321')

    for (let i = 0; i < 5; i++) {
      const wrong = await request(ctx.app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          email: user.email,
          code: '000000',
          newPassword: 'my-new-password',
        })
      expect(wrong.status).toBe(400)
    }

    const right = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'my-new-password',
      })
    expect(right.status).toBe(400)
    expect(right.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })
})
