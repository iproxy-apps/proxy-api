import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /tasks/price-preview (e2e)', () => {
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
      '/tasks/price-preview?offeredPrice=100',
    )

    expect(response.status).toBe(401)
  })

  it('returns the D1 breakdown as numbers for R$ 100,00', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/price-preview?offeredPrice=100')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      offeredPrice: 100,
      platformFee: 20,
      stripeFee: 4.38,
      chargedAmount: 100,
      proxyEarnings: 80,
    })
  })

  it('rounds half-up (20.03)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/price-preview?offeredPrice=20.03')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      offeredPrice: 20.03,
      platformFee: 4.01,
      stripeFee: 1.19,
      chargedAmount: 20.03,
      proxyEarnings: 16.02,
    })
  })

  it.each(['19.99', '10000.01', 'abc', ''])(
    'rejects offeredPrice=%s',
    async (value) => {
      const user = await createUser(ctx.app, ctx.prisma)

      const response = await request(ctx.app.getHttpServer())
        .get(`/tasks/price-preview?offeredPrice=${value}`)
        .set('Authorization', `Bearer ${user.token}`)

      expect(response.status).toBe(400)
    },
  )

  it('is not shadowed by GET /tasks/:id', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/price-preview?offeredPrice=100')
      .set('Authorization', `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body).not.toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })
})
