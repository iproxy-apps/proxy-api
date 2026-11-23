import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('phase 1 schema constraints (e2e)', () => {
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

  it('allows only one active card per user (partial unique index)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const data = {
      userId: user.id,
      stripeCardId: 'pm_1',
      brand: 'visa',
      last4: '4242',
    }
    await ctx.prisma.cards.create({ data })
    await expect(
      ctx.prisma.cards.create({ data: { ...data, stripeCardId: 'pm_2' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await ctx.prisma.cards.updateMany({
      where: { userId: user.id },
      data: { isDeleted: true },
    })
    await expect(
      ctx.prisma.cards.create({ data: { ...data, stripeCardId: 'pm_2' } }),
    ).resolves.toBeDefined()
  })

  it('rejects two payments for the same PaymentIntent', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id)
    await ctx.prisma.payments.create({
      data: { taskId: task.id, paymentIntent: 'pi_dup', amount: 100 },
    })
    await expect(
      ctx.prisma.payments.create({
        data: { taskId: task.id, paymentIntent: 'pi_dup', amount: 100 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('exposes the new columns with their defaults', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id)
    const user = await ctx.prisma.users.findUniqueOrThrow({
      where: { id: owner.id },
    })
    expect(user.payoutIssue).toBe(false)
    expect(task).toHaveProperty('stripeFee')
    expect(task).toHaveProperty('chargedAmount')
  })
})
