import { TasksRepository } from './tasks.repository'
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
  tasks: {
    create: jest.fn(async () => {
      calls.push('create-task')
      return { id: 'task-1' }
    }),
  },
})

const makeRepo = (tx: ReturnType<typeof makeTx>) => {
  const prisma = {
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  }
  return new TasksRepository(prisma as unknown as PrismaService)
}

describe('TasksRepository.createTask lock order', () => {
  const data = {
    title: 't',
    userId: 'user-1',
    description: 'd',
    offeredPrice: 10,
    platformFee: 1,
    stripeFee: 1,
    chargedAmount: 12,
    proxyEarnings: 8,
    locationLat: 0,
    locationLng: 0,
    locationAddress: 'a',
    city: 'São Paulo',
    state: 'SP',
  } as never

  it('locks, verifies the owner, then writes', async () => {
    const calls: string[] = []
    const tx = makeTx(calls, { isDeleted: false })
    await expect(makeRepo(tx).createTask(data)).resolves.toEqual({
      id: 'task-1',
    })
    expect(calls).toEqual(['lock', 'find-owner', 'create-task', 'update-user'])
  })

  it.each([
    ['deleted owner', { isDeleted: true }],
    ['missing owner', null],
  ])('aborts before writing on %s', async (_, owner) => {
    const calls: string[] = []
    const tx = makeTx(calls, owner)
    await expect(makeRepo(tx).createTask(data)).rejects.toBeInstanceOf(
      OwnerUnavailableError,
    )
    expect(calls).toEqual(['lock', 'find-owner'])
  })
})
