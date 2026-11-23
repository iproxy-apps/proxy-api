import { assertTestDatabaseUrl } from './assert-test-database-url'

describe('assertTestDatabaseUrl', () => {
  it('accepts the Testcontainers database', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://test:test@localhost:55001/proxy_test',
      ),
    ).not.toThrow()
  })

  it('refuses the local dev database', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://postgres:docker@localhost:5432/proxy?schema=public',
      ),
    ).toThrow(/refusing to TRUNCATE/)
  })

  it('refuses an unset URL', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(
      /refusing to TRUNCATE/,
    )
  })
})
