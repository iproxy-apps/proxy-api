import { PutObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'

import { ProofNotFoundError } from './proof-storage'
import { S3ProofStorage } from './s3-proof-storage'

describe('S3ProofStorage', () => {
  const send = jest.fn()
  const storage = new S3ProofStorage({ send }, 'proofs')

  beforeEach(() => send.mockReset())

  it('puts objects with bucket, key and content type', async () => {
    const body = Buffer.from([1, 2, 3])
    await storage.put('t/a.jpg', body, 'image/jpeg')
    const cmd = send.mock.calls[0][0]
    expect(cmd).toBeInstanceOf(PutObjectCommand)
    expect(cmd.input).toEqual({
      Bucket: 'proofs',
      Key: 't/a.jpg',
      Body: body,
      ContentType: 'image/jpeg',
    })
  })

  it('returns the object body as a stream', async () => {
    send.mockResolvedValueOnce({ Body: Readable.from(['x']) })
    expect(await storage.getStream('t/a.jpg')).toBeInstanceOf(Readable)
  })

  it('maps NoSuchKey to ProofNotFoundError', async () => {
    send.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { name: 'NoSuchKey' }),
    )
    await expect(storage.getStream('t/x.jpg')).rejects.toBeInstanceOf(
      ProofNotFoundError,
    )
  })
})
