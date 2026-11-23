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

    expect(ctx.stripeMock.searchCustomer).toHaveBeenCalledWith(payload.email)
    expect(ctx.stripeMock.createCustomer).toHaveBeenCalledWith(
      payload.email,
      payload.name,
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

  it('reuses an existing Stripe customer when search returns a match', async () => {
    ctx.stripeMock.searchCustomer.mockResolvedValueOnce({
      data: [{ id: 'cus_existing' }],
    } as Awaited<ReturnType<typeof ctx.stripeMock.searchCustomer>>)

    const payload = validPayload()
    await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send(payload)
      .expect(200)

    const user = await ctx.prisma.users.findUnique({
      where: { email: payload.email },
    })
    expect(user?.stripeCustomerId).toBe('cus_existing')
    expect(ctx.stripeMock.createCustomer).not.toHaveBeenCalled()
  })
})
