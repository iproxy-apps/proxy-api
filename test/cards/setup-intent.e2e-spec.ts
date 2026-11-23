import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /card/setup-intent (e2e)', () => {
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
    const response = await request(ctx.app.getHttpServer())
      .post('/card/setup-intent')
      .send()

    expect(response.status).toBe(401)
  })

  it('returns the client secret of an off-session SetupIntent', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/card/setup-intent')
      .set('Authorization', `Bearer ${user.token}`)
      .send()

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      clientSecret: 'seti_test_123_secret_abc',
      setupIntentId: 'seti_test_123',
    })
    expect(ctx.stripeMock.createSetupIntent).toHaveBeenCalledWith(
      'cus_test_default',
    )
  })

  it('returns 404 USER_NOT_FOUND when the user has no Stripe customer', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      stripeCustomerId: null,
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/card/setup-intent')
      .set('Authorization', `Bearer ${user.token}`)
      .send()

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_FOUND' })
  })
})
