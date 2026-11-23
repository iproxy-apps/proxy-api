import { createReadStream } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'

import { ProofNotFoundError } from './proof-storage'
import type { ProofStorage } from './proof-storage'

export class LocalDiskProofStorage implements ProofStorage {
  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    const full = resolve(this.rootDir, key)
    if (!full.startsWith(resolve(this.rootDir) + sep)) {
      throw new ProofNotFoundError(key)
    }
    return full
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const full = this.resolveKey(key)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body)
  }

  async getStream(key: string): Promise<Readable> {
    const full = this.resolveKey(key)
    try {
      await access(full)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ProofNotFoundError(key)
      }
      throw error
    }
    return createReadStream(full)
  }
}
