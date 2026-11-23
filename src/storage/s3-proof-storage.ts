import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'

import { ProofNotFoundError } from './proof-storage'
import type { ProofStorage } from './proof-storage'

export class S3ProofStorage implements ProofStorage {
  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
  }

  async getStream(key: string): Promise<Readable> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (!out.Body) throw new ProofNotFoundError(key)
      return out.Body as Readable
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') {
        throw new ProofNotFoundError(key)
      }
      throw error
    }
  }
}
