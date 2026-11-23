import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LocalDiskProofStorage } from './local-disk-proof-storage'
import { ProofNotFoundError } from './proof-storage'

describe('LocalDiskProofStorage', () => {
  let dir: string
  let storage: LocalDiskProofStorage

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'proofs-'))
    storage = new LocalDiskProofStorage(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('round-trips bytes under nested keys', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    await storage.put('task-1/a.jpg', bytes, 'image/jpeg')
    const chunks: Buffer[] = []
    for await (const c of await storage.getStream('task-1/a.jpg')) {
      chunks.push(c as Buffer)
    }
    expect(Buffer.concat(chunks)).toEqual(bytes)
  })

  it('rejects missing keys with ProofNotFoundError', async () => {
    await expect(storage.getStream('nope.jpg')).rejects.toBeInstanceOf(
      ProofNotFoundError,
    )
  })

  it('refuses keys escaping the root', async () => {
    await expect(storage.getStream('../../etc/passwd')).rejects.toBeInstanceOf(
      ProofNotFoundError,
    )
    await expect(
      storage.put('../x.jpg', Buffer.from([1]), 'image/jpeg'),
    ).rejects.toBeInstanceOf(ProofNotFoundError)
  })
})
