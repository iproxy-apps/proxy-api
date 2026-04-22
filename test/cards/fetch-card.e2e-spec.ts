import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /card/fetch (e2e)', () => {
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
    const response = await request(ctx.app.getHttpServer()).get('/card/fetch')

    expect(response.status).toBe(401)
  })

  it('returns 404 when the user has no saved card', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/card/fetch')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'NO_SAVED_CARD_FOUND' })
  })

  it("returns the user's saved card", async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.cards.create({
      data: {
        userId: user.id,
        stripeCardId: 'pm_saved_1',
        brand: 'mastercard',
        last4: '0001',
      },
    })

    const response = await request(ctx.app.getHttpServer())
      .get('/card/fetch')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      userId: user.id,
      stripeCardId: 'pm_saved_1',
      brand: 'mastercard',
      last4: '0001',
    })
  })
})
