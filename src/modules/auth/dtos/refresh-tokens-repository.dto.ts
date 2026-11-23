export type RefreshTokenRow = {
  id: string
  userId: string
  familyId: string
  expiresAt: Date
  revokedAt: Date | null
  replacedById: string | null
}

export type NewRefreshToken = {
  userId: string
  familyId: string
  tokenHash: string
  expiresAt: Date
}

export interface RefreshTokensRepositoryDto {
  create: (data: NewRefreshToken) => Promise<{ id: string }>
  createForUser: (
    userId: string,
    expectedPasswordHash: string,
    data: NewRefreshToken,
  ) => Promise<{ id: string }>
  findByHash: (tokenHash: string) => Promise<RefreshTokenRow | null>
  rotate: (
    currentId: string,
    next: NewRefreshToken,
  ) => Promise<{ id: string } | null>
  revokeFamily: (familyId: string) => Promise<void>
}
