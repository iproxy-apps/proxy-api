import request from 'supertest'

import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/create (e2e)', () => {
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

  const validPayload = () => ({
    name: 'New User',
    email: `new-${Date.now()}-${Math.random()}@test.io`,
    password: 'password123',
    userType: 'CLIENT' as const,
    termsAccepted: true,
  })

  it('rejects invalid body payloads', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ name: 'missing fields' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  it('creates a user, a Stripe customer and returns a session', async () => {
    const payload = validPayload()

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('session')
    expect(typeof response.body.session).toBe('string')

    const user = await ctx.prisma.users.findUnique({
      where: { email: payload.email },
    })
    expect(user).not.toBeNull()
    expect(user?.stripeCustomerId).toBe('cus_test_123')
    expect(user?.password).not.toBe(payload.password)

    expect(ctx.stripeMock.createCustomer).toHaveBeenCalledWith(
      payload.email,
      payload.name,
      user?.id,
    )
  })

  it('returns 409 when an account with the email already exists', async () => {
    const payload = validPayload()

    const first = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)
    expect(first.status).toBe(200)

    const second = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)

    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ errorCode: 'USER_EMAIL_EXISTS' })
  })

  it('returns 409 when the same email differs only by case', async () => {
    const base = validPayload()
    const local = `Ana${Date.now()}`
    await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ ...base, email: `${local}@X.com` })
      .expect(200)

    const second = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ ...base, email: `${local.toLowerCase()}@x.com` })

    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ errorCode: 'USER_EMAIL_EXISTS' })
    expect(await ctx.prisma.users.count()).toBe(1)
  })

  it('accepts an apostrophe in the local part', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ ...validPayload(), email: "o'neil@x.com" })
      .expect(200)

    expect(ctx.stripeMock.createCustomer).toHaveBeenCalledWith(
      "o'neil@x.com",
      'New User',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    )
  })

  it('creates the Stripe customer after the row with the user id in metadata', async () => {
    const payload = validPayload()
    await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)
      .expect(200)

    const user = await ctx.prisma.users.findUniqueOrThrow({
      where: { email: payload.email },
    })
    expect(ctx.stripeMock.createCustomer.mock.calls[0][2]).toBe(user.id)
    expect(user.stripeCustomerId).toBe('cus_test_123')
  })

  it('rolls back the user when Stripe is unavailable', async () => {
    ctx.stripeMock.createCustomer.mockRejectedValueOnce(new Error('down'))
    const payload = validPayload()

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)

    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({ errorCode: 'SIGN_UP_UNAVAILABLE' })
    expect(
      await ctx.prisma.users.findUnique({ where: { email: payload.email } }),
    ).toBeNull()
  })

  it('rejects server-owned fields (strict schema)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({
        ...validPayload(),
        isVerified: true,
        rating: 5,
        walletBalance: 1000,
      })

    expect(response.status).toBe(400)
    expect(await ctx.prisma.users.count()).toBe(0)
  })

  it('rejects termsAccepted: false', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ ...validPayload(), termsAccepted: false })

    expect(response.status).toBe(400)
    expect(await ctx.prisma.users.count()).toBe(0)
  })

  it('rejects passwords shorter than 8 characters', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ ...validPayload(), password: '1234567' })

    expect(response.status).toBe(400)
  })

  it('normalises the email to lowercase and trims it', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({ ...validPayload(), email: '  Ana@Test.IO ' })
      .expect(200)

    const user = await ctx.prisma.users.findUnique({
      where: { email: 'ana@test.io' },
    })
    expect(user).not.toBeNull()
  })

  it('hashes the password with bcrypt cost 10', async () => {
    const payload = validPayload()
    await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)
      .expect(200)

    const user = await ctx.prisma.users.findUnique({
      where: { email: payload.email },
    })
    expect(user?.password).toMatch(/^\$2[aby]\$10\$/)
  })

  it('accepts and discards the legacy document keys', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({
        ...validPayload(),
        userType: 'PROXY',
        documentType: 'CPF',
        documentUrl: 'https://x.test/doc.jpg',
      })

    expect(response.status).toBe(200)
    expect(await ctx.prisma.users.count()).toBe(1)
    const user = await ctx.prisma.users.findFirst()
    expect(user?.documentType).toBeNull()
    expect(user?.documentUrl).toBeNull()
  })
})
