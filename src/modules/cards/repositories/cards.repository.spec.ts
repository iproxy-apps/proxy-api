import { CardsRepository } from './cards.repository'
import { OwnerUnavailableError } from 'src/common/owner-lock'

import type { PrismaService } from 'src/prisma/prisma.service'

const makeTx = (calls: string[], owner: { isDeleted: boolean } | null) => ({
  $executeRaw: jest.fn(async () => {
    calls.push('lock')
    return 0
  }),
  users: {
    findUnique: jest.fn(async () => {
      calls.push('find-owner')
      return owner
    }),
    update: jest.fn(async () => {
      calls.push('update-user')
      return {}
    }),
  },
  cards: {
    findFirst: jest.fn(async () => {
      calls.push('find-card')
      return null
    }),
    update: jest.fn(),
    create: jest.fn(async () => {
      calls.push('create-card')
      return { id: 'card-1' }
    }),
  },
})

const makeRepo = (tx: ReturnType<typeof makeTx>) => {
  const prisma = {
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  }
  return new CardsRepository(prisma as unknown as PrismaService)
}

describe('CardsRepository.replaceUserCard lock order', () => {
  const data = {
    userId: 'user-1',
    stripeCardId: 'pm_1',
    brand: 'visa',
    last4: '4242',
  }

  it('locks, verifies the owner, then writes', async () => {
    const calls: string[] = []
    const tx = makeTx(calls, { isDeleted: false })
    await makeRepo(tx).replaceUserCard(data)
    expect(calls).toEqual([
      'lock',
      'find-owner',
      'find-card',
      'create-card',
      'update-user',
    ])
  })

  it('aborts before any card write when the owner is deleted', async () => {
    const calls: string[] = []
    const tx = makeTx(calls, { isDeleted: true })
    await expect(makeRepo(tx).replaceUserCard(data)).rejects.toBeInstanceOf(
      OwnerUnavailableError,
    )
    expect(calls).toEqual(['lock', 'find-owner'])
  })
})
