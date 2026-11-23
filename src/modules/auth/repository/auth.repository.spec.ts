import { AuthRepository } from './auth.repository'

import type { PrismaService } from 'src/prisma/prisma.service'

describe('AuthRepository.createPasswordResetCode', () => {
  it('takes the per-user advisory lock before touching reset codes', async () => {
    const calls: string[] = []
    const tx = {
      $executeRaw: jest.fn(async () => {
        calls.push('lock')
      }),
      passwordResetCodes: {
        updateMany: jest.fn(async () => {
          calls.push('invalidate')
        }),
        create: jest.fn(async () => {
          calls.push('create')
        }),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) =>
        fn(tx),
      ),
    }

    const repository = new AuthRepository(prisma as unknown as PrismaService)
    await repository.createPasswordResetCode('user-1', 'hash', new Date())

    expect(calls).toEqual(['lock', 'invalidate', 'create'])
  })
})

const makeDeleteTx = (calls: string[], blockingCount: number) => ({
  $executeRaw: jest.fn(async () => {
    calls.push('lock')
  }),
  tasks: {
    count: jest.fn(async () => {
      calls.push('count')
      return blockingCount
    }),
    updateMany: jest.fn(async () => {
      calls.push('cancel')
    }),
  },
  refreshTokens: {
    updateMany: jest.fn(async () => {
      calls.push('tokens')
    }),
  },
  cards: {
    findMany: jest.fn(async () => []),
    updateMany: jest.fn(async () => {
      calls.push('cards')
    }),
  },
  users: {
    findUnique: jest.fn(async () => ({ stripeCustomerId: null })),
    updateMany: jest.fn(async () => {
      calls.push('users')
      return { count: 1 }
    }),
  },
})

const makeDeletePrisma = (tx: ReturnType<typeof makeDeleteTx>) => ({
  $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
    fn(tx),
  ),
})

describe('AuthRepository.deleteAccount', () => {
  it('locks, cancels available listings, then counts blocking tasks, before any other write', async () => {
    const calls: string[] = []
    const tx = makeDeleteTx(calls, 0)
    const repository = new AuthRepository(
      makeDeletePrisma(tx) as unknown as PrismaService,
    )

    const result = await repository.deleteAccount('user-1')

    expect(result.status).toBe('deleted')
    expect(calls.slice(0, 3)).toEqual(['lock', 'cancel', 'count'])
    expect(calls.indexOf('count')).toBeLessThan(calls.indexOf('users'))
  })

  it('aborts the transaction (rolling the cancel back) when a blocking task exists', async () => {
    const calls: string[] = []
    const tx = makeDeleteTx(calls, 1)
    const repository = new AuthRepository(
      makeDeletePrisma(tx) as unknown as PrismaService,
    )

    await expect(repository.deleteAccount('user-1')).resolves.toEqual({
      status: 'blocked',
    })
    expect(calls).toEqual(['lock', 'cancel', 'count'])
  })

  it('reports already_deleted when the user row was already deleted', async () => {
    const calls: string[] = []
    const tx = makeDeleteTx(calls, 0)
    tx.users.updateMany.mockResolvedValue({ count: 0 })
    const repository = new AuthRepository(
      makeDeletePrisma(tx) as unknown as PrismaService,
    )

    await expect(repository.deleteAccount('user-1')).resolves.toEqual({
      status: 'already_deleted',
    })
  })
})
