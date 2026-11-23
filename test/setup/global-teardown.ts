import { rm } from 'node:fs/promises'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

export default async function globalTeardown() {
  const globalAny = globalThis as unknown as {
    __PG_CONTAINER__?: StartedPostgreSqlContainer
  }

  await globalAny.__PG_CONTAINER__?.stop()
  if (process.env.PROOF_DIR) {
    await rm(process.env.PROOF_DIR, { recursive: true, force: true })
  }
  if (process.env.PROXY_TEST_ENV_FILE) {
    await rm(process.env.PROXY_TEST_ENV_FILE, { force: true })
  }
}
