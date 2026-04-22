import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /auth/merchant-dashboard (e2e)', () => {
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
    const response = await request(ctx.app.getHttpServer()).get(
      '/auth/merchant-dashboard',
    )

    expect(response.status).toBe(401)
  })

  it('returns 404 when the user has no linked merchant account', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountId: null,
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/merchant-dashboard')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      errorCode: 'MERCHANT_ACCOUNT_NOT_FOUND',
    })
  })

  it('returns the dashboard url for users with a merchant account', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      userType: 'PROXY',
      stripeAccountId: 'acct_linked',
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/auth/merchant-dashboard')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      dashboardUrl: 'https://stripe.test/dashboard',
    })
    expect(ctx.stripeMock.createDashboardLoginLink).toHaveBeenCalledWith(
      'acct_linked',
    )
  })
})
