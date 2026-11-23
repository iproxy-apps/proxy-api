import { subDays } from 'date-fns'
import { SchedulerRegistry } from '@nestjs/schedule'

import { createTask } from '../factories/task.factory'
import { createPayment } from '../factories/payment.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'
import { AutoReleaseTasksJob } from 'src/modules/tasks/jobs/auto-release-tasks.job'

import type { TestAppContext } from '../setup/test-app.factory'

describe('AutoReleaseTasksJob (e2e)', () => {
  let ctx: TestAppContext
  let job: AutoReleaseTasksJob

  beforeAll(async () => {
    ctx = await createTestApp()
    job = ctx.app.get(AutoReleaseTasksJob)
  })

  afterAll(async () => {
    await ctx.app.close()
  })

  beforeEach(async () => {
    await resetDatabase(ctx.prisma)
    ctx.stripeMock.createTransferFromCharge.mockReset()
    ctx.stripeMock.createTransferFromCharge.mockResolvedValue({
      id: 'tr_test_123',
    } as unknown as Awaited<
      ReturnType<typeof ctx.stripeMock.createTransferFromCharge>
    >)
  })

  type SeedPayment = Parameters<typeof createPayment>[2]

  let seq = 0
  const seedStale = async (daysAgo: number, payment: SeedPayment) => {
    seq += 1
    const owner = await createUser(ctx.app, ctx.prisma, {
      email: `owner${seq}@test.io`,
    })
    const proxy = await createUser(ctx.app, ctx.prisma, {
      email: `proxy${seq}@test.io`,
      userType: 'PROXY',
      stripeAccountId: 'acct_proxy_test',
      stripeAccountReady: true,
    })
    const task = await createTask(ctx.prisma, owner.id, {
      status: 'verification_required',
      startedAt: subDays(new Date(), daysAgo + 1),
      completedAt: subDays(new Date(), daysAgo),
    })
    await ctx.prisma.userTaskMapping.create({
      data: { taskId: task.id, executorId: proxy.id },
    })
    await createPayment(ctx.prisma, task.id, {
      paymentIntent: `pi_${task.id}`,
      ...payment,
    })
    return { owner, proxy, task }
  }

  it('validates tasks stuck for 7+ days and skips the rest', async () => {
    const a = await seedStale(8, { status: 'succeeded', chargeId: 'ch_a' })
    const b = await seedStale(6, { status: 'succeeded', chargeId: 'ch_b' })
    const c = await seedStale(8, { status: 'pending' })
    const d = await seedStale(8, { status: 'disputed', disputeId: 'dp_1' })

    const result = await job.execute()

    expect(result.released).toEqual([a.task.id])
    expect(result.skipped.sort()).toEqual([c.task.id, d.task.id].sort())
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledTimes(1)
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTransaction: 'ch_a', amount: 4000 }),
      `task:${a.task.id}:transfer`,
    )

    const read = (id: string) =>
      ctx.prisma.tasks.findUniqueOrThrow({ where: { id } })
    const ta = await read(a.task.id)
    expect(ta.status).toBe('completed')
    expect(ta.transferId).toBe('tr_test_123')
    for (const t of [b, c, d]) {
      expect((await read(t.task.id)).status).toBe('verification_required')
    }
    const proxyA = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: a.proxy.id },
    })
    expect(proxyA.walletBalance.toFixed(2)).toBe('40.00')
  })

  it('is idempotent: a second run releases nothing', async () => {
    await seedStale(8, { status: 'succeeded', chargeId: 'ch_a' })

    const first = await job.execute()
    const second = await job.execute()

    expect(first.released).toHaveLength(1)
    expect(second.released).toEqual([])
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledTimes(1)
  })

  it('exposes the cron metadata', () => {
    const reg = ctx.app.get(SchedulerRegistry)
    expect(reg.getCronJob('auto-release-tasks')).toBeDefined()
  })
})
