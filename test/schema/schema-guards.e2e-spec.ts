import { createTask } from '../factories/task.factory'
import { createUser } from '../factories/user.factory'
import { createTestApp, resetDatabase } from '../setup/test-app.factory'

import type { TestAppContext } from '../setup/test-app.factory'

describe('schema guards (e2e)', () => {
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

  it('has the expected indexes', async () => {
    const rows = await ctx.prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`
    const names = rows.map((r) => r.indexname)
    expect(names).toEqual(
      expect.arrayContaining([
        'tasks_status_createdAt_idx',
        'tasks_owner_idx',
        'tasks_city_status_createdAt_idx',
        'payments_taskId_idx',
        'cards_userId_idx',
        'user_task_mapping_executorId_idx',
        'ratings_ratedId_idx',
        'password_reset_codes_userId_createdAt_idx',
        'users_stripeAccountId_idx',
      ]),
    )
  })

  it('restricts deletes through financial foreign keys', async () => {
    const rows = await ctx.prisma.$queryRaw<
      { conname: string; confdeltype: string }[]
    >`
      SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint
      WHERE conname IN ('tasks_owner_fkey', 'payments_taskId_fkey')`
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.confdeltype).toBe('r')
  })

  it('refuses to hard-delete a user who owns tasks', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    await createTask(ctx.prisma, owner.id)
    await expect(
      ctx.prisma.users.delete({ where: { id: owner.id } }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })
})
