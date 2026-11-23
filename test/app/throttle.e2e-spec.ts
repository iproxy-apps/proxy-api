import request from 'supertest'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

const AUTH_ROUTES = [
  '/auth/session',
  '/auth/create',
  '/auth/forgot-password',
  '/auth/verify-reset-code',
]

describe('rate limiting (e2e)', () => {
  let ctx: TestAppContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
    process.env.NODE_ENV = 'production' // disables skipIf for the requests below
  })

  afterEach(() => {
    process.env.NODE_ENV = 'test'
  })

  it('keeps regular routes on the 100/min default (6th call is not throttled)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    for (let i = 0; i < 6; i++) {
      const response = await request(ctx.app.getHttpServer())
        .get('/tasks/active')
        .set('Authorization', `Bearer ${user.token}`)
      expect(response.status).toBe(200)
    }
  })

  it.each(AUTH_ROUTES)(
    'limits %s to 5 requests per minute per IP',
    async (path) => {
      for (let i = 0; i < 5; i++) {
        const response = await request(ctx.app.getHttpServer())
          .post(path)
          .send({})
        expect(response.status).toBe(400) // VALIDATION_FAILED still counts
      }
      const sixth = await request(ctx.app.getHttpServer()).post(path).send({})
      expect(sixth.status).toBe(429)
      expect(sixth.headers['retry-after']).toBeDefined()
      expect(sixth.body).toMatchObject({
        errorCode: 'TOO_MANY_REQUESTS',
        message: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
      })
    },
  )

  it('skips throttling entirely when LOOP_TEST_HOOKS=1 (device loop)', async () => {
    process.env.LOOP_TEST_HOOKS = '1'
    process.env.NODE_ENV = 'development' // hooks are honoured outside production
    try {
      for (let i = 0; i < 6; i++) {
        const response = await request(ctx.app.getHttpServer())
          .post('/auth/session')
          .send({})
        expect(response.status).toBe(400)
      }
    } finally {
      delete process.env.LOOP_TEST_HOOKS
    }
  })

  it('ignores LOOP_TEST_HOOKS=1 in production (limits stay on)', async () => {
    process.env.LOOP_TEST_HOOKS = '1'
    try {
      for (let i = 0; i < 5; i++) {
        await request(ctx.app.getHttpServer()).post('/auth/session').send({})
      }
      const sixth = await request(ctx.app.getHttpServer())
        .post('/auth/session')
        .send({})
      expect(sixth.status).toBe(429)
    } finally {
      delete process.env.LOOP_TEST_HOOKS
    }
  })
})

describe('rate limiting behind a proxy (e2e)', () => {
  let untrusted: TestAppContext
  let trusted: TestAppContext

  beforeAll(async () => {
    untrusted = await createTestApp()
    trusted = await createTestApp({ trustProxy: 1 })
    process.env.NODE_ENV = 'production'
  })

  afterAll(async () => {
    process.env.NODE_ENV = 'test'
    await untrusted.app.close()
    await trusted.app.close()
  })

  it('ignores X-Forwarded-For when TRUST_PROXY is 0 (one shared bucket)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(untrusted.app.getHttpServer())
        .post('/auth/session')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({})
    }
    const sixth = await request(untrusted.app.getHttpServer())
      .post('/auth/session')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({})
    expect(sixth.status).toBe(429)
  })

  it('keys buckets by forwarded IP when TRUST_PROXY is 1', async () => {
    for (let i = 0; i < 6; i++) {
      const response = await request(trusted.app.getHttpServer())
        .post('/auth/session')
        .set('X-Forwarded-For', `10.0.1.${i}`)
        .send({})
      expect(response.status).toBe(400)
    }
  })
})
