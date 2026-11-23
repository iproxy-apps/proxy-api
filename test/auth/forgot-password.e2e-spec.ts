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

  const waitFor = async (condition: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 300 && !(await condition()); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(await condition()).toBe(true)
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

  const silentMessage = 'Se o email existir, um código de recuperação será enviado.'

  it('returns a silent message when the user does not exist', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'missing@test.io' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: silentMessage })
    await settle()
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

    await waitFor(
      async () =>
        (await ctx.prisma.passwordResetCodes.count({
          where: { userId: user.id },
        })) === 1,
    )
    const codes = await ctx.prisma.passwordResetCodes.findMany({
      where: { userId: user.id },
    })
    expect(codes).toHaveLength(1)
    expect(codes[0].state).toBe('pending')
    expect(codes[0].expiresAt.getTime()).toBeGreaterThan(Date.now())

    expect(ctx.notificationMock.sendResetCodeByEmail).toHaveBeenCalledTimes(1)
    const [emailArg, plainCode, nameArg] =
      ctx.notificationMock.sendResetCodeByEmail.mock.calls[0]
    expect(emailArg).toBe('user@test.io')
    expect(nameArg).toBe('Real User')
    expect(plainCode).toMatch(/^\d{6}$/)
  })

  it('returns the generic message and sends nothing after 3 recent codes', async () => {
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

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: silentMessage })
    await settle()
    expect(ctx.notificationMock.sendResetCodeByEmail).not.toHaveBeenCalled()
    expect(await ctx.prisma.passwordResetCodes.count()).toBe(3)
  })

  it('returns the generic message and persists nothing when the email fails to send', async () => {
    await createUser(ctx.app, ctx.prisma, { email: 'fail@test.io' })
    ctx.notificationMock.sendResetCodeByEmail.mockRejectedValueOnce(
      new Error('mail provider down'),
    )

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'fail@test.io' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: silentMessage })
    await waitFor(
      () => ctx.notificationMock.sendResetCodeByEmail.mock.calls.length === 1,
    )
    await settle()
    expect(await ctx.prisma.passwordResetCodes.count()).toBe(0)
  })

  it('keeps only the newest code pending', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      email: 'two@test.io',
    })

    for (let i = 0; i < 2; i++) {
      const response = await request(ctx.app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'two@test.io' })
      expect(response.status).toBe(200)
      await waitFor(
        async () =>
          (await ctx.prisma.passwordResetCodes.count({
            where: { userId: user.id },
          })) === i + 1,
      )
    }

    const codes = await ctx.prisma.passwordResetCodes.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(codes).toHaveLength(2)
    expect(codes[0].state).toBe('used')
    expect(codes[1].state).toBe('pending')
  })

  it('treats a deleted user as unknown: generic answer, no code, no mail', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const scrubbed = `deleted-${user.id}@deleted.local`
    await ctx.prisma.users.update({
      where: { id: user.id },
      data: { isDeleted: true, deletedAt: new Date(), email: scrubbed },
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: scrubbed })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ message: silentMessage })
    await settle()
    expect(ctx.notificationMock.sendResetCodeByEmail).not.toHaveBeenCalled()
    expect(
      await ctx.prisma.passwordResetCodes.count({ where: { userId: user.id } }),
    ).toBe(0)
  })
})
