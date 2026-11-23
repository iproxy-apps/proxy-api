import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /card/create (e2e)', () => {
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
      .post('/card/create')
      .send({ token: 'tok_123' })

    expect(response.status).toBe(401)
  })

  it('rejects payloads without a token', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({})

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  it('tokenizes the card via Stripe and persists it for the user', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token: 'pm_abc' })

    expect(response.status).toBe(201)
    expect(ctx.stripeMock.retrievePaymentMethod).toHaveBeenCalledWith('pm_abc')
    expect(ctx.stripeMock.attachPaymentMethodToCustomer).toHaveBeenCalledWith(
      'pm_test_123',
      user.stripeCustomerId,
    )

    expect(response.body).toMatchObject({
      userId: user.id,
      stripeCardId: 'pm_test_123',
      brand: 'visa',
      last4: '4242',
    })
    expect(response.body.id).toEqual(expect.any(String))

    const cards = await ctx.prisma.cards.findMany({ where: { userId: user.id } })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      userId: user.id,
      stripeCardId: 'pm_test_123',
      brand: 'visa',
      last4: '4242',
    })
  })
})
