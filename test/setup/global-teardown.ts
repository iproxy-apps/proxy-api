import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

export default async function globalTeardown() {
  const globalAny = globalThis as unknown as {
    __PG_CONTAINER__?: StartedPostgreSqlContainer
  }

  await globalAny.__PG_CONTAINER__?.stop()
}
