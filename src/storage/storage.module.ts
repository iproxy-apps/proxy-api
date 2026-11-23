import { S3Client } from '@aws-sdk/client-s3'
import { Global, Module } from '@nestjs/common'
import { join } from 'node:path'

import { EnvModule } from 'src/env/env.module'
import { EnvService } from 'src/env/env.service'
import { LocalDiskProofStorage } from './local-disk-proof-storage'
import { PROOF_STORAGE } from './proof-storage'
import type { ProofStorage } from './proof-storage'
import { S3ProofStorage } from './s3-proof-storage'

type ProofEnv = { get(key: string): string | undefined }

const requireVar = (env: ProofEnv, key: string): string => {
  const value = env.get(key)
  if (!value) {
    throw new Error(`${key} is required when S3_BUCKET is set`)
  }
  return value
}

export function createProofStorage(env: ProofEnv): ProofStorage {
  const bucket = env.get('S3_BUCKET')
  if (bucket) {
    const accessKeyId = requireVar(env, 'S3_ACCESS_KEY_ID')
    const secretAccessKey = requireVar(env, 'S3_SECRET_ACCESS_KEY')
    const endpoint = env.get('S3_ENDPOINT') || undefined
    return new S3ProofStorage(
      new S3Client({
        region: env.get('S3_REGION') || 'auto',
        endpoint,
        forcePathStyle: Boolean(endpoint),
        credentials: { accessKeyId, secretAccessKey },
      }),
      bucket,
    )
  }
  return new LocalDiskProofStorage(
    env.get('PROOF_DIR') || join(process.cwd(), 'tmp', 'proofs'),
  )
}

@Global()
@Module({
  imports: [EnvModule],
  providers: [
    {
      provide: PROOF_STORAGE,
      inject: [EnvService],
      useFactory: (env: EnvService): ProofStorage =>
        createProofStorage({ get: (key) => env.get(key as never) as never }),
    },
  ],
  exports: [PROOF_STORAGE],
})
export class StorageModule {}
