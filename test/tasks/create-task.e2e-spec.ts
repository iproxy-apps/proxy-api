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
    cardDetails: { savedCard: 'pm_owner' },
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

  const withPrice = (offeredPrice: number) => ({
    ...taskPayload,
    pricing: { offeredPrice },
  })

  const seedCard = (userId: string) =>
    ctx.prisma.cards.create({
      data: {
        userId,
        stripeCardId: 'pm_owner',
        brand: 'visa',
        last4: '4242',
      },
    })

  const post = (token: string, body: unknown) =>
    request(ctx.app.getHttpServer())
      .post('/tasks/create')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object)

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/create')
      .send(taskPayload)

    expect(response.status).toBe(401)
  })

  it.each([0, 19.99, 20.005, 10000.01])(
    'rejects offeredPrice %p',
    async (offeredPrice) => {
      const user = await createUser(ctx.app, ctx.prisma)
      await seedCard(user.id)

      const response = await post(user.token, withPrice(offeredPrice))

      expect(response.status).toBe(400)
      expect(await ctx.prisma.tasks.count()).toBe(0)
    },
  )

  it('rejects cardDetails {} and both keys at once', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const empty = await post(user.token, { ...taskPayload, cardDetails: {} })
    const both = await post(user.token, {
      ...taskPayload,
      cardDetails: { savedCard: 'a', paymentMethodId: 'b' },
    })

    expect(empty.status).toBe(400)
    expect(both.status).toBe(400)
    expect(await ctx.prisma.tasks.count()).toBe(0)
  })

  it('rejects a PROXY with 403 USER_NOT_CLIENT and writes nothing', async () => {
    const proxy = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    await seedCard(proxy.id)

    const response = await post(proxy.token, taskPayload)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'USER_NOT_CLIENT' })
    expect(await ctx.prisma.tasks.count()).toBe(0)
    const updated = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: proxy.id },
    })
    expect(updated.totalTasksCreated).toBe(0)
  })

  it('rejects a savedCard that is not the active card and writes nothing', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(user.token, {
      ...taskPayload,
      cardDetails: { savedCard: 'pm_other' },
    })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'NO_SAVED_CARD_FOUND' })
    expect(await ctx.prisma.tasks.count()).toBe(0)
    const updated = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(updated.totalTasksCreated).toBe(0)
  })

  it('creates the task with the D1 fee breakdown persisted', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(user.token, withPrice(100))

    expect(response.status).toBe(201)
    expect(Object.keys(response.body)).toEqual(['id'])

    const t = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: response.body.id },
    })
    expect(t.offeredPrice.toFixed(2)).toBe('100.00')
    expect(t.platformFee?.toFixed(2)).toBe('20.00')
    expect(t.stripeFee?.toFixed(2)).toBe('4.38')
    expect(t.chargedAmount?.toFixed(2)).toBe('100.00')
    expect(t.proxyEarnings?.toFixed(2)).toBe('80.00')
    expect(t.status).toBe('available')
    expect(t).toMatchObject({
      title: taskPayload.title,
      description: taskPayload.description,
      owner: user.id,
    })

    const updated = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(updated.totalTasksCreated).toBe(1)
  })

  it('rounds half-up (20.03 and 50)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const a = await post(user.token, withPrice(20.03))
    const b = await post(user.token, withPrice(50))
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)

    const ta = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: a.body.id },
    })
    expect(ta.platformFee?.toFixed(2)).toBe('4.01')
    expect(ta.stripeFee?.toFixed(2)).toBe('1.19')
    expect(ta.chargedAmount?.toFixed(2)).toBe('20.03')
    expect(ta.proxyEarnings?.toFixed(2)).toBe('16.02')

    const tb = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: b.body.id },
    })
    expect(tb.platformFee?.toFixed(2)).toBe('10.00')
    expect(tb.stripeFee?.toFixed(2)).toBe('2.39')
    expect(tb.chargedAmount?.toFixed(2)).toBe('50.00')
    expect(tb.proxyEarnings?.toFixed(2)).toBe('40.00')
  })

  it('saves a new card from a confirmed paymentMethodId and creates the task', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await post(user.token, {
      ...taskPayload,
      cardDetails: { paymentMethodId: 'pm_test_123' },
    })

    expect(response.status).toBe(201)
    const cards = await ctx.prisma.cards.findMany({
      where: { userId: user.id, isDeleted: false },
    })
    expect(cards).toHaveLength(1)
    expect(cards[0].stripeCardId).toBe('pm_test_123')
    expect(await ctx.prisma.tasks.count()).toBe(1)
  })

  it('increments the totalTasksCreated counter on each call (not overwrite)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    await post(user.token, taskPayload)
    await post(user.token, taskPayload)
    await post(user.token, taskPayload)

    const updatedUser = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updatedUser?.totalTasksCreated).toBe(3)
  })

  const paulista = {
    formattedAddress:
      'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil',
    city: 'São Paulo',
    state: 'SP',
    locationLat: -23.5614,
    locationLng: -46.6559,
  }

  const withAddress = (address: object) => ({ ...taskPayload, address })

  it('stores the canonical city/state and the formatted address', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(
      user.token,
      withAddress({ ...paulista, city: 'sao paulo', state: 'sp' }),
    )

    expect(response.status).toBe(201)
    const t = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: response.body.id },
    })
    expect(t.city).toBe('São Paulo')
    expect(t.state).toBe('SP')
    expect(t.locationAddress).toBe(paulista.formattedAddress)
  })

  it('appends the complement to the stored address', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(
      user.token,
      withAddress({ ...paulista, complement: 'apto 42' }),
    )

    expect(response.status).toBe(201)
    const t = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: response.body.id },
    })
    expect(t.locationAddress).toBe(`${paulista.formattedAddress} — apto 42`)
  })

  it('rejects a city outside the served list with CITY_NOT_SERVED', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await post(
      user.token,
      withAddress({ ...paulista, city: 'Curitiba', state: 'PR' }),
    )

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'CITY_NOT_SERVED',
      message:
        'Ainda não atendemos nessa cidade. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.',
    })
    expect(await ctx.prisma.tasks.count()).toBe(0)
    Object.values(ctx.stripeMock).forEach((fn) => {
      if (jest.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled()
    })
  })

  it('rejects a served city name with the wrong state', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(
      user.token,
      withAddress({ ...paulista, state: 'RJ' }),
    )

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'CITY_NOT_SERVED' })
  })

  it('still accepts the legacy street/zipCode body', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(
      user.token,
      withAddress({
        street: 'Rua A, 10',
        zipCode: '30130-005',
        city: 'Belo Horizonte',
        state: 'mg',
        locationLat: -19.92,
        locationLng: -43.94,
      }),
    )

    expect(response.status).toBe(201)
    const t = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: response.body.id },
    })
    expect(t.locationAddress).toBe('Rua A, 10, Belo Horizonte - MG, 30130-005')
  })

  it('rejects an address with neither formattedAddress nor street + zipCode', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(
      user.token,
      withAddress({
        city: 'São Paulo',
        state: 'SP',
        locationLat: -23.55,
        locationLng: -46.63,
      }),
    )

    expect(response.status).toBe(400)
    expect(await ctx.prisma.tasks.count()).toBe(0)
  })

  it('rejects unknown address keys', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await seedCard(user.id)

    const response = await post(
      user.token,
      withAddress({ ...paulista, placeId: 'ChIJ' }),
    )

    expect(response.status).toBe(400)
    expect(await ctx.prisma.tasks.count()).toBe(0)
  })
})
