import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type { Prisma } from '@prisma/client'
import type {
  NewRefreshToken,
  RefreshTokenRow,
  RefreshTokensRepositoryDto,
} from '../dtos/refresh-tokens-repository.dto'

class LostRotationError extends Error {}

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

  async revokeAllForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient) => {
      await lockUser(client, userId)
      await client.refreshTokens.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    if (tx) return run(tx)
    await this.prisma.$transaction(run)
  }
}
