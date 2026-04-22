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
})
