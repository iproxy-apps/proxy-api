import {
  hashRefreshToken,
  generateRefreshToken,
  refreshTokenExpiry,
} from './refresh-token'

describe('refresh-token utils', () => {
  it('generates distinct 43-character tokens with a matching sha256 hash', () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()

    expect(a.token).not.toBe(b.token)
    expect(a.token).toHaveLength(43)
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.tokenHash).toBe(hashRefreshToken(a.token))
  })

  it('expires 60 days after the given date', () => {
    expect(
      refreshTokenExpiry(new Date('2026-01-01T00:00:00Z')).toISOString(),
    ).toBe('2026-03-02T00:00:00.000Z')
  })
})
