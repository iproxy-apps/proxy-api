export const TEST_DATABASE_NAME = 'proxy_test'

export function assertTestDatabaseUrl(url: string | undefined): void {
  let got = '"<unset>"'
  try {
    if (url) {
      const parsed = new URL(url)
      got = `${parsed.host}${parsed.pathname}`
      if (parsed.pathname === `/${TEST_DATABASE_NAME}`) return
    }
  } catch {
    got = '"<unset>"'
  }
  throw new Error(
    `refusing to TRUNCATE: DATABASE_URL does not point at the Testcontainers database "${TEST_DATABASE_NAME}" (got ${got})`,
  )
}
