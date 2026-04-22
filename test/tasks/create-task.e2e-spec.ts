import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/create (e2e)', () => {
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

  const taskPayload = {
    cardDetails: {},
    title: 'Comprar mantimentos',
    description: 'Ir ao mercado e trazer os itens da lista',
    address: {
      state: 'SP',
      city: 'São Paulo',
      locationLat: -23.55,
      locationLng: -46.63,
      street: 'Rua A, 123',
      zipCode: '01000-000',
    },
    pricing: { offeredPrice: 50 },
  }

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/create')
      .send(taskPayload)

    expect(response.status).toBe(401)
  })

  it('creates a task for the authenticated user', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send(taskPayload)

    expect(response.status).toBe(201)

    const tasks = await ctx.prisma.tasks.findMany({
      where: { owner: user.id },
    })

    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      title: taskPayload.title,
      description: taskPayload.description,
      status: 'available',
      owner: user.id,
    })
    expect(Number(tasks[0].offeredPrice)).toBe(taskPayload.pricing.offeredPrice)

    const updatedUser = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updatedUser?.totalTasksCreated).toBe(1)
  })

  it('rejects payloads with invalid schema', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'missing fields' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)

    const tasks = await ctx.prisma.tasks.findMany()
    expect(tasks).toHaveLength(0)
  })
})
