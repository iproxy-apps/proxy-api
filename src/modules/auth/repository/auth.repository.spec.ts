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
