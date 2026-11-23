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
      .send({ paymentMethodId: 'pm_test_123' })

    expect(response.status).toBe(401)
  })

  it('rejects the legacy { token } body', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token: 'pm_abc' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
    expect(await ctx.prisma.cards.count()).toBe(0)
  })

  it('rejects a payment method that is not attached to the caller customer', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    ctx.stripeMock.retrievePaymentMethod.mockResolvedValueOnce({
      id: 'pm_other',
      customer: 'cus_other',
      card: { brand: 'visa', last4: '1111' },
    } as any)

    const response = await request(ctx.app.getHttpServer())
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_other' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'CARD_NOT_CONFIRMED' })
    expect(await ctx.prisma.cards.count()).toBe(0)
  })

  it('saves the confirmed payment method as the active card', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_test_123' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      userId: user.id,
      stripeCardId: 'pm_test_123',
      brand: 'visa',
      last4: '4242',
    })
    expect(ctx.stripeMock.retrievePaymentMethod).toHaveBeenCalledWith(
      'pm_test_123',
    )
    expect(ctx.stripeMock.detachPaymentMethod).not.toHaveBeenCalled()
  })

  it('replaces the previous card, soft-deletes it and detaches it on Stripe', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const server = ctx.app.getHttpServer()

    await request(server)
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_test_123' })
      .expect(201)

    ctx.stripeMock.retrievePaymentMethod.mockResolvedValueOnce({
      id: 'pm_new',
      customer: 'cus_test_default',
      card: { brand: 'mastercard', last4: '0001' },
    } as any)

    const response = await request(server)
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_new' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ stripeCardId: 'pm_new' })

    const active = await ctx.prisma.cards.findMany({
      where: { userId: user.id, isDeleted: false },
    })
    expect(active).toHaveLength(1)
    expect(active[0].stripeCardId).toBe('pm_new')
    expect(
      await ctx.prisma.cards.count({
        where: { userId: user.id, isDeleted: true },
      }),
    ).toBe(1)
    expect(ctx.stripeMock.detachPaymentMethod).toHaveBeenCalledWith(
      'pm_test_123',
    )

    const fetched = await request(server)
      .get('/card/fetch')
      .set('Authorization', `Bearer ${user.token}`)

    expect(fetched.status).toBe(200)
    expect(fetched.body).toMatchObject({ stripeCardId: 'pm_new' })
  })

  it('keeps the card when detaching the previous one fails on Stripe', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const server = ctx.app.getHttpServer()

    await request(server)
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_test_123' })
      .expect(201)

    ctx.stripeMock.retrievePaymentMethod.mockResolvedValueOnce({
      id: 'pm_new',
      customer: 'cus_test_default',
      card: { brand: 'mastercard', last4: '0001' },
    } as any)
    ctx.stripeMock.detachPaymentMethod.mockRejectedValueOnce(
      new Error('resource_missing'),
    )

    const response = await request(server)
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_new' })

    expect(response.status).toBe(201)
    const active = await ctx.prisma.cards.findMany({
      where: { userId: user.id, isDeleted: false },
    })
    expect(active).toHaveLength(1)
    expect(active[0].stripeCardId).toBe('pm_new')
  })

  it('clears cardActionRequired when a new card is saved', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.users.update({
      where: { id: user.id },
      data: { cardActionRequired: true },
    })

    await request(ctx.app.getHttpServer())
      .post('/card/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ paymentMethodId: 'pm_test_123' })
      .expect(201)

    const updated = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(updated.cardActionRequired).toBe(false)
  })
})
