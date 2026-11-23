import { promises as fs } from 'fs'
import { join } from 'path'
import request from 'supertest'
import sharp from 'sharp'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createPayment } from '../factories/payment.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('POST /tasks/finish (e2e)', () => {
  let ctx: TestAppContext
  let png: Buffer

  beforeAll(async () => {
    ctx = await createTestApp()
    png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#0f0' },
    })
      .png()
      .toBuffer()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
  })

  const seedInProgressTask = async ({ withPayment = true } = {}) => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'in_progress',
      startedAt: new Date(),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    if (withPayment) {
      await createPayment(ctx.prisma, task.id, {
        status: 'succeeded',
        chargeId: 'ch_test_1',
      })
    }
    return { owner, proxy, task }
  }

  it('rejects unauthenticated requests', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .field('taskId', 'task-1')

    expect(response.status).toBe(401)
  })

  it('returns 404 when the task does not exist', async () => {
    const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${user.token}`)
      .field('taskId', '00000000-0000-0000-0000-000000000000')

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('rejects when the caller is not the executor', async () => {
    const { task } = await seedInProgressTask()
    const other = await createUser(ctx.app, ctx.prisma, {
      email: 'other@test.io',
      userType: 'PROXY',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${other.token}`)
      .field('taskId', task.id)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ errorCode: 'CANNOT_FINISH_TASK' })
  })

  it('requires a proof photo', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'PROOF_PHOTO_REQUIRED' })

    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(stored.status).toBe('in_progress')
    expect(stored.completedAt).toBeNull()
  })

  it('stores the normalised proof and marks verification_required', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' })

    expect(response.status).toBe(200)

    const updated = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(updated.status).toBe('verification_required')
    expect(updated.completedAt).not.toBeNull()
    expect(updated.proofImageUrl).toMatch(
      new RegExp(`^${task.id}/[0-9a-f-]{36}\\.jpg$`),
    )

    const bytes = await fs.readFile(
      join(process.env.PROOF_DIR!, updated.proofImageUrl!),
    )
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })

  it('rejects files whose bytes are not an image', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', Buffer.from('garbage'), {
        filename: 'p.png',
        contentType: 'image/png',
      })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      errorCode: 'FILE_FORMAT_NOT_SUPPORTED',
    })

    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(stored.status).toBe('in_progress')
  })

  it('refuses to finish without a confirmed charge and writes nothing', async () => {
    const { proxy, task } = await seedInProgressTask({ withPayment: false })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'PAYMENT_NOT_CONFIRMED' })

    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(stored.status).toBe('in_progress')
    expect(stored.proofImageUrl).toBeNull()
    const written = await fs
      .readdir(join(process.env.PROOF_DIR!, task.id))
      .catch(() => [])
    expect(written).toHaveLength(0)
  })

  it('refuses to finish when the payment is disputed', async () => {
    const { proxy, task } = await seedInProgressTask({ withPayment: false })
    await createPayment(ctx.prisma, task.id, {
      status: 'disputed',
      disputeId: 'dp_1',
    })

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({ errorCode: 'PAYMENT_DISPUTED' })

    const stored = await ctx.prisma.tasks.findUniqueOrThrow({
      where: { id: task.id },
    })
    expect(stored.status).toBe('in_progress')
    expect(stored.proofImageUrl).toBeNull()
  })

  it('rejects a proof above 10 MB with a Portuguese 413', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })

    expect(response.status).toBe(413)
    expect(response.body).toMatchObject({
      errorCode: 'FILE_TOO_LARGE',
      message: 'Arquivo muito grande. O limite é 10 MB.',
    })

    const stored = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(stored?.status).toBe('in_progress')
  })

  it('returns 400 VALIDATION_FAILED for a non-UUID proof id', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/not-a-uuid/proof')
      .set('Authorization', `Bearer ${user.token}`)
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })
})
