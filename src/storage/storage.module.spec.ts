import { join } from 'node:path'

import { LocalDiskProofStorage } from './local-disk-proof-storage'
import { S3ProofStorage } from './s3-proof-storage'
import { createProofStorage } from './storage.module'

const envOf = (vars: Record<string, string | undefined>) => ({
  get: (key: string) => vars[key],
})

describe('createProofStorage', () => {
  it.each([{}, { PROOF_DIR: '' }])(
    'defaults to <cwd>/tmp/proofs on disk for %j',
    (vars) => {
      const storage = createProofStorage(envOf(vars))
      expect(storage).toBeInstanceOf(LocalDiskProofStorage)
      expect((storage as unknown as { rootDir: string }).rootDir).toBe(
        join(process.cwd(), 'tmp', 'proofs'),
      )
    },
  )

  it('uses S3 when the bucket and both keys are set', () => {
    const storage = createProofStorage(
      envOf({
        S3_BUCKET: 'proofs',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    )
    expect(storage).toBeInstanceOf(S3ProofStorage)
  })

  it('throws naming the missing variable when a key is missing', () => {
    expect(() =>
      createProofStorage(
        envOf({ S3_BUCKET: 'proofs', S3_ACCESS_KEY_ID: 'id' }),
      ),
    ).toThrow('S3_SECRET_ACCESS_KEY')
  })
})
