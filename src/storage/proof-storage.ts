import type { Readable } from 'node:stream'

export const PROOF_STORAGE = Symbol('PROOF_STORAGE')

export interface ProofStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** Rejects with ProofNotFoundError when the key is missing. */
  getStream(key: string): Promise<Readable>
}

export class ProofNotFoundError extends Error {
  constructor(key: string) {
    super(`Proof not found: ${key}`)
    this.name = 'ProofNotFoundError'
  }
}
