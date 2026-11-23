import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/merchant-account (e2e)', () => {
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

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/auth/merchant-account',
    )

    expect(response.status).toBe(401)
  })

  it('creates a new Stripe account, persists it and returns the onboarding link', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      name: 'John Doe',
      userType: 'PROXY',
      stripeAccountId: null,
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/merchant-account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      accountLinkUrl: 'https://stripe.test/onboarding',
    })

    expect(ctx.stripeMock.createMerchantAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: user.email,
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: user.phoneNumber,
      }),
    )

    const updatedUser = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updatedUser?.stripeAccountId).toBe('acct_test_123')
  })

  it('reuses the existing Stripe account when one is already linked', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountId: 'acct_existing',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/merchant-account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(ctx.stripeMock.createMerchantAccount).not.toHaveBeenCalled()
    expect(ctx.stripeMock.linkMerchantAccount).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_existing' }),
    )

    const updatedUser = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updatedUser?.stripeAccountId).toBe('acct_existing')
  })
  it('returns 403 for a CLIENT', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      userType: 'CLIENT',
      stripeAccountId: null,
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/merchant-account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_PROXY' })
    expect(ctx.stripeMock.createMerchantAccount).not.toHaveBeenCalled()
  })

  it('passes a distinct refresh_url', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountId: null,
    })

    await request(ctx.app.getHttpServer())
      .post('/auth/merchant-account')
      .set('Authorization', `Bearer ${user.token}`)

    expect(ctx.stripeMock.linkMerchantAccount).toHaveBeenCalledWith({
      account: 'acct_test_123',
      returnUrl: 'http://localhost:3000/callback',
      refreshUrl: 'http://localhost:3000/callback?refresh=1',
    })
  })

  it('sends a multi-word last name and omits the empty phone', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      name: 'Ana Maria da Silva',
      userType: 'PROXY',
      stripeAccountId: null,
      phoneNumber: null,
    })

    await request(ctx.app.getHttpServer())
      .post('/auth/merchant-account')
      .set('Authorization', `Bearer ${user.token}`)

    const arg = ctx.stripeMock.createMerchantAccount.mock.calls[0][0]
    expect(arg.firstName).toBe('Ana')
    expect(arg.lastName).toBe('Maria da Silva')
    expect(arg.phoneNumber).toBeUndefined()
  })
})
