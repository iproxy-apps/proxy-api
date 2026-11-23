import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import request from 'supertest'
import sharp from 'sharp'

import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('GET /tasks/:id/proof (e2e)', () => {
  let ctx: TestAppContext
  let jpeg: Buffer

  beforeAll(async () => {
    ctx = await createTestApp()
    jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#0f0' },
    })
      .jpeg()
      .toBuffer()
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
  })

  const writeProof = async (key: string) => {
    const path = join(process.env.PROOF_DIR!, key)
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, jpeg)
  }

  const seed = async (proofKey: string | null = null) => {
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: 'owner@test.io',
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: 'proxy@test.io',
      userType: 'PROXY',
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
      startedAt: new Date(),
      completedAt: new Date(),
    })
    const key = proofKey === null ? null : proofKey.replace('{id}', task.id)
    if (key) {
      await ctx.prisma.tasks.update({
        where: { id: task.id },
        data: { proofImageUrl: key },
      })
    }
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    return { owner, proxy, task, key }
  }

  const get = (id: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(`/tasks/${id}/proof`)
    return token ? req.set('Authorization', `Bearer ${token}`) : req
  }

  it('rejects unauthenticated requests', async () => {
    const { task } = await seed('{id}/p.jpg')

    const response = await get(task.id)

    expect(response.status).toBe(401)
  })

  it('streams the proof to the owner as image/jpeg', async () => {
    const { owner, task, key } = await seed('{id}/p.jpg')
    await writeProof(key!)

    const response = await get(task.id, owner.token).buffer(true)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/^image\/jpeg/)
    expect(Buffer.from(response.body).subarray(0, 2)).toEqual(
      Buffer.from([0xff, 0xd8]),
    )
  })

  it('streams the proof to the mapped executor', async () => {
    const { proxy, task, key } = await seed('{id}/p.jpg')
    await writeProof(key!)

    const response = await get(task.id, proxy.token)

    expect(response.status).toBe(200)
  })

  it('hides the proof from strangers', async () => {
    const { task, key } = await seed('{id}/p.jpg')
    await writeProof(key!)
    const stranger = await createUser(ctx.app, ctx.prisma, {
      email: 'stranger@test.io',
    })

    const response = await get(task.id, stranger.token)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ errorCode: 'TASK_NOT_FOUND' })
  })

  it('returns 404 when the object is missing from storage', async () => {
    const { owner, task } = await seed('{id}/missing.jpg')

    const response = await get(task.id, owner.token)

    expect(response.status).toBe(404)
  })

  it('returns 404 when the task has no proof', async () => {
    const { owner, task } = await seed(null)

    const response = await get(task.id, owner.token)

    expect(response.status).toBe(404)
  })
})
