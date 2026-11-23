import request from 'supertest'
import { hash } from 'bcryptjs'

import { MAX_RESET_CODE_ATTEMPTS } from 'src/modules/auth/utils/auth-schemas'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/verify-reset-code (e2e)', () => {
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
        state: overrides.state ?? 'pending',
      },
    })
  }

  it('rejects malformed codes', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: 'user@test.io', code: 'abc' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  it('returns invalidOrExpiredCode when the user does not exist', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: 'missing@test.io', code: '123456' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('returns invalidOrExpiredCode when there is no valid code', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '123456' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('returns invalidOrExpiredCode when the code does not match', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    await insertCode(user.id, '111111')

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '999999' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('marks the code as verified and returns success when the code matches', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const code = await insertCode(user.id, '654321')

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Código verificado com sucesso.',
    })

    const stored = await ctx.prisma.passwordResetCodes.findUnique({
      where: { id: code.id },
    })
    expect(stored?.state).toBe('verified')
  })

  it('rejects reuse of an already-verified code', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    await insertCode(user.id, '654321')

    // First verify succeeds.
    const first = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })
    expect(first.status).toBe(200)

    // Second verify with the same code MUST fail.
    const second = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })
    expect(second.status).toBe(400)
    expect(second.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('invalidates the code after 5 wrong attempts', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const code = await insertCode(user.id, '654321')

    for (let i = 0; i < 5; i++) {
      const wrong = await request(ctx.app.getHttpServer())
        .post('/auth/verify-reset-code')
        .send({ email: user.email, code: '000000' })
      expect(wrong.status).toBe(400)
    }

    const stored = await ctx.prisma.passwordResetCodes.findUnique({
      where: { id: code.id },
    })
    expect(stored?.attempts).toBe(5)

    const right = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })
    expect(right.status).toBe(400)
    expect(right.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('still accepts the right code after fewer than 5 wrong attempts', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const code = await insertCode(user.id, '654321')

    for (let i = 0; i < 2; i++) {
      await request(ctx.app.getHttpServer())
        .post('/auth/verify-reset-code')
        .send({ email: user.email, code: '000000' })
    }

    const right = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })
    expect(right.status).toBe(200)

    const stored = await ctx.prisma.passwordResetCodes.findUnique({
      where: { id: code.id },
    })
    expect(stored?.state).toBe('verified')
  })

  it('caps attempts under parallel guesses', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const code = await insertCode(user.id, '654321')

    await Promise.all(
      Array.from({ length: 10 }, () =>
        request(ctx.app.getHttpServer())
          .post('/auth/verify-reset-code')
          .send({ email: user.email, code: '000000' }),
      ),
    )

    const stored = await ctx.prisma.passwordResetCodes.findUnique({
      where: { id: code.id },
    })
    expect(stored?.attempts).toBeLessThanOrEqual(MAX_RESET_CODE_ATTEMPTS)

    const right = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })
    expect(right.status).toBe(400)
    expect(right.body).toMatchObject({
      errorCode: 'PASSWORD_RESET_INVALID_CODE',
    })
  })

  it('gives reset-password a fresh attempt budget after 4 wrong + right', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { email: 'u@test.io' })
    const code = await insertCode(user.id, '654321')

    for (let i = 0; i < 4; i++) {
      await request(ctx.app.getHttpServer())
        .post('/auth/verify-reset-code')
        .send({ email: user.email, code: '000000' })
    }

    const verify = await request(ctx.app.getHttpServer())
      .post('/auth/verify-reset-code')
      .send({ email: user.email, code: '654321' })
    expect(verify.status).toBe(200)

    const stored = await ctx.prisma.passwordResetCodes.findUnique({
      where: { id: code.id },
    })
    expect(stored?.attempts).toBe(0)

    const reset = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email: user.email,
        code: '654321',
        newPassword: 'my-new-password',
      })
    expect(reset.status).toBe(200)
  })
})
