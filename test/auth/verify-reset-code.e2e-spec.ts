import request from 'supertest'
import { hash } from 'bcryptjs'

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
})
