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

  const insertCode = async (userId: string, plaintext: string) => {
    return ctx.prisma.passwordResetCodes.create({
      data: {
        userId,
        code: await hash(plaintext, 8),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    })
  }

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

  it('updates the password, marks the code as used and returns success', async () => {
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
    expect(updatedCode?.used).toBe(true)
  })
})
