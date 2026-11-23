import { createHash, randomBytes } from 'node:crypto'

export const ACCESS_TOKEN_TTL = '30m'
export const ACCESS_TOKEN_TTL_SECONDS = 1800
export const REFRESH_TOKEN_TTL_DAYS = 60

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

export const generateRefreshToken = (): {
  token: string
  tokenHash: string
} => {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashRefreshToken(token) }
}

export const refreshTokenExpiry = (from: Date): Date =>
  new Date(from.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
