import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

export default async function globalTeardown() {
  const globalAny = globalThis as unknown as {
    __PG_CONTAINER__?: StartedPostgreSqlContainer
  }

  await globalAny.__PG_CONTAINER__?.stop()
  await rm(join(tmpdir(), 'proxy-proofs-e2e'), { recursive: true, force: true })
}
