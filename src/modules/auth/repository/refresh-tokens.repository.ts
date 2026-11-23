import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type { Prisma } from '@prisma/client'
import type {
  NewRefreshToken,
  RefreshTokenRow,
  RefreshTokensRepositoryDto,
} from '../dtos/refresh-tokens-repository.dto'

class LostRotationError extends Error {}

export class SessionNotIssuableError extends Error {
  constructor() {
    super('Session can no longer be issued for this user')
  }
}

// Serializes every refresh-token write of one user (rotation vs revocation).
const lockUser = async (tx: Prisma.TransactionClient, userId: string) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
}

@Injectable()
export class RefreshTokensRepository implements RefreshTokensRepositoryDto {
  constructor(private prisma: PrismaService) {}

  async create(data: NewRefreshToken): Promise<{ id: string }> {
    return this.prisma.refreshTokens.create({ data, select: { id: true } })
  }

  // Login path: the row is only inserted when the password the login verified
  // is still the current one, under the same per-user lock reset/delete take.
  async createForUser(
    userId: string,
    expectedPasswordHash: string,
    data: NewRefreshToken,
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId)
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: { password: true, isDeleted: true },
      })
      if (!user || user.isDeleted || user.password !== expectedPasswordHash) {
        throw new SessionNotIssuableError()
      }
      return tx.refreshTokens.create({ data, select: { id: true } })
    })
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    return this.prisma.refreshTokens.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        replacedById: true,
      },
    })
  }

  async rotate(
    currentId: string,
    next: NewRefreshToken,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockUser(tx, next.userId)
        const created = await tx.refreshTokens.create({
          data: next,
          select: { id: true },
        })
        const { count } = await tx.refreshTokens.updateMany({
          where: { id: currentId, revokedAt: null, replacedById: null },
          data: { revokedAt: new Date(), replacedById: created.id },
        })
        if (count === 0) throw new LostRotationError()
        return created
      })
    } catch (error) {
      if (error instanceof LostRotationError) return null
      throw error
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.refreshTokens.findFirst({
        where: { familyId },
        select: { userId: true },
      })
      if (!owner) return
      await lockUser(tx, owner.userId)
      await tx.refreshTokens.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    })
  }
}
