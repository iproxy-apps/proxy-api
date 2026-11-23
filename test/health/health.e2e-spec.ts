import request from 'supertest'

import { createTestApp } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /health (e2e)', () => {
  let ctx: TestAppContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  it('answers 200 without authentication', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
