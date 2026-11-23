import request from 'supertest'
import { JwtService } from '@nestjs/jwt'

import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('identity documents removed (e2e)', () => {
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

  it('has no identity-document columns on users', async () => {
    const rows = await ctx.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = current_schema()
    `
    const names = rows.map((row) => row.column_name)

    expect(names.length).toBeGreaterThan(0)
    expect(names).not.toEqual(expect.arrayContaining(['documentType']))
    expect(names).not.toEqual(expect.arrayContaining(['documentUrl']))
    expect(names).not.toEqual(expect.arrayContaining(['isVerified']))
  })

  it('has no DocumentType enum', async () => {
    const rows = await ctx.prisma.$queryRaw<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typname = 'DocumentType'
    `

    expect(rows).toHaveLength(0)
  })

  it('signs no document claims after a sign-up that sent documentType', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/auth/create')
      .send({
        name: 'New User',
        email: `new-${Date.now()}-${Math.random()}@test.io`,
        password: 'password123',
        userType: 'PROXY',
        termsAccepted: true,
        documentType: 'CPF',
      })

    expect(response.status).toBe(200)
    const decoded = ctx.app
      .get(JwtService)
      .decode(response.body.session) as Record<string, unknown>
    expect(decoded).not.toHaveProperty('documentType')
    expect(decoded).not.toHaveProperty('documentUrl')
    expect(decoded).not.toHaveProperty('isVerified')
  })
})
