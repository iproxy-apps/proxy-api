import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /auth/me (e2e)', () => {
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

  const me = async (token: string) =>
    request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/auth/me')

    expect(response.status).toBe(401)
  })

  it('returns the fresh user subset with numeric money and rating', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.users.update({
      where: { id: user.id },
      data: {
        walletBalance: 250.5,
        rating: 4.25,
        payoutIssue: true,
        cardActionRequired: true,
      },
    })

    const response = await me(user.token)

    expect(response.status).toBe(200)
    expect(Object.keys(response.body).sort()).toEqual([
      'avatarUrl',
      'cardActionRequired',
      'email',
      'id',
      'name',
      'payoutIssue',
      'phoneNumber',
      'rating',
      'stripeAccountId',
      'stripeAccountReady',
      'termsAccepted',
      'totalTasksCompleted',
      'totalTasksCreated',
      'userType',
      'walletBalance',
    ])
    expect(response.body.walletBalance).toBe(250.5)
    expect(response.body.rating).toBe(4.25)
    expect(response.body.payoutIssue).toBe(true)
    expect(response.body.cardActionRequired).toBe(true)
  })

  it('never exposes secrets', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await me(user.token)

    expect(response.status).toBe(200)
    expect(response.body).not.toHaveProperty('password')
    expect(response.body).not.toHaveProperty('stripeCustomerId')
    expect(response.body).not.toHaveProperty('refreshTokens')
  })
})
