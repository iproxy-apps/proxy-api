import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('DELETE /card/:id (e2e)', () => {
  let ctx: TestAppContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
    ctx.stripeMock.detachPaymentMethod.mockClear()
  })

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer()).delete(
      '/card/00000000-0000-0000-0000-000000000000',
    )

    expect(response.status).toBe(401)
  })

  it('returns 404 when the card does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .delete('/card/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'CARD_NOT_FOUND' })
    expect(ctx.stripeMock.detachPaymentMethod).not.toHaveBeenCalled()
  })

  it('returns 403 when the card belongs to another user', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const other = await createUser(ctx.app, ctx.prisma)

    const card = await ctx.prisma.cards.create({
      data: {
        userId: owner.id,
        stripeCardId: 'pm_saved_1',
        brand: 'visa',
        last4: '4242',
      },
    })

    const response = await request(ctx.app.getHttpServer())
      .delete(`/card/${card.id}`)
      .set('Authorization', `Bearer ${other.token}`)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_DELETE_CARD' })
    expect(ctx.stripeMock.detachPaymentMethod).not.toHaveBeenCalled()

    const untouched = await ctx.prisma.cards.findUnique({
      where: { id: card.id },
    })
    expect(untouched?.isDeleted).toBe(false)
  })

  it('soft-deletes the card and detaches the payment method on Stripe', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const card = await ctx.prisma.cards.create({
      data: {
        userId: user.id,
        stripeCardId: 'pm_saved_1',
        brand: 'visa',
        last4: '4242',
      },
    })

    const response = await request(ctx.app.getHttpServer())
      .delete(`/card/${card.id}`)
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(204)
    expect(ctx.stripeMock.detachPaymentMethod).toHaveBeenCalledWith(
      'pm_saved_1',
    )

    const stored = await ctx.prisma.cards.findUnique({ where: { id: card.id } })
    expect(stored?.isDeleted).toBe(true)
  })

  it('hides soft-deleted cards from GET /card/fetch', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const card = await ctx.prisma.cards.create({
      data: {
        userId: user.id,
        stripeCardId: 'pm_saved_1',
        brand: 'visa',
        last4: '4242',
      },
    })

    await request(ctx.app.getHttpServer())
      .delete(`/card/${card.id}`)
      .set('Authorization', `Bearer ${user.token}`)

    const fetched = await request(ctx.app.getHttpServer())
      .get('/card/fetch')
      .set('Authorization', `Bearer ${user.token}`)

    expect(fetched.status).toBe(404)
    expect(fetched.body).toMatchObject({ errorCode: 'NO_SAVED_CARD_FOUND' })
  })
})
