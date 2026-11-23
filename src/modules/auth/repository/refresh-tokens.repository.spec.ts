import {
  RefreshTokensRepository,
  SessionNotIssuableError,
} from './refresh-tokens.repository'

import type { PrismaService } from 'src/prisma/prisma.service'

const makeTx = (calls: string[], updateCount = 1) => ({
  $executeRaw: jest.fn(async () => {
    calls.push('lock')
    return 0
  }),
  users: {
    findUnique: jest.fn(async () => {
      calls.push('find-user')
      return { password: 'hash', isDeleted: false }
    }),
  },
  refreshTokens: {
    create: jest.fn(async () => {
      calls.push('create')
      return { id: 'new' }
    }),
    findFirst: jest.fn(async () => {
      calls.push('find')
      return { userId: 'user-1' }
    }),
    updateMany: jest.fn(async () => {
      calls.push('update')
      return { count: updateCount }
    }),
  },
})

const makeRepo = (tx: ReturnType<typeof makeTx>) => {
  const prisma = {
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  }
  return new RefreshTokensRepository(prisma as unknown as PrismaService)
}

describe('RefreshTokensRepository lock order', () => {
  const next = {
    userId: 'user-1',
    familyId: 'f',
    tokenHash: 'h',
    expiresAt: new Date(),
  }

  it('rotate takes the user lock before any write', async () => {
    const calls: string[] = []
    await makeRepo(makeTx(calls)).rotate('cur', next)
    expect(calls).toEqual(['lock', 'create', 'update'])
  })

  it('rotate returns null on a lost race', async () => {
    const calls: string[] = []
    await expect(makeRepo(makeTx(calls, 0)).rotate('cur', next)).resolves.toBe(
      null,
    )
  })

  it('revokeFamily locks the family owner before updating', async () => {
    const calls: string[] = []
    await makeRepo(makeTx(calls)).revokeFamily('f')
    expect(calls).toEqual(['find', 'lock', 'update'])
  })

  it('createForUser locks, re-checks the hash, then inserts', async () => {
    const calls: string[] = []
    const tx = makeTx(calls)
    await makeRepo(tx).createForUser('user-1', 'hash', next)
    expect(calls).toEqual(['lock', 'find-user', 'create'])
  })

  it.each([
    ['hash mismatch', { password: 'other', isDeleted: false }],
    ['deleted user', { password: 'hash', isDeleted: true }],
    ['missing user', null],
  ])('createForUser refuses on %s without inserting', async (_, row) => {
    const calls: string[] = []
    const tx = makeTx(calls)
    tx.users.findUnique.mockResolvedValueOnce(row as never)
    await expect(
      makeRepo(tx).createForUser('user-1', 'hash', next),
    ).rejects.toBeInstanceOf(SessionNotIssuableError)
    expect(calls).toEqual(['lock'])
    expect(tx.refreshTokens.create).not.toHaveBeenCalled()
  })
})
