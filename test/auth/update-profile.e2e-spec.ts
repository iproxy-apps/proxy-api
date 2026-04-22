import request from 'supertest'
import { compare } from 'bcryptjs'

import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /auth/update-profile (e2e)', () => {
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
      .post('/auth/update-profile')
      .send({ name: 'x', userType: 'CLIENT' })

    expect(response.status).toBe(401)
  })

  it('updates the profile and returns a new session', async () => {
    const user = await createUser(ctx.app, ctx.prisma, {
      name: 'Old Name',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/update-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'New Name',
        userType: 'CLIENT',
        phoneNumber: '+5511000000000',
      })

    expect(response.status).toBe(200)
    expect(typeof response.body.session).toBe('string')

    const updated = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updated?.name).toBe('New Name')
    expect(updated?.phoneNumber).toBe('+5511000000000')
  })

  it('hashes the new password when provided', async () => {
    const user = await createUser(ctx.app, ctx.prisma)

    const response = await request(ctx.app.getHttpServer())
      .post('/auth/update-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: user.name,
        userType: 'CLIENT',
        password: 'brand-new-pass',
      })

    expect(response.status).toBe(200)
    const updated = await ctx.prisma.users.findUnique({
      where: { id: user.id },
    })
    expect(updated?.password).not.toBe('brand-new-pass')
    await expect(
      compare('brand-new-pass', updated!.password),
    ).resolves.toBe(true)
  })
})
