import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
import { MAX_RESET_CODE_ATTEMPTS } from '../utils/auth-schemas'
import { DELETION_BLOCKING_STATUSES } from '../dtos/auth-repository.dto'

import type {
  FindUserByEmailResult,
  UpdateUserProfileRepositoryPayload,
} from '../types'
import type {
  AuthRepositoryDTO,
  DeleteAccountResult,
  HistoryPage,
  HistoryTaskRow,
} from '../dtos/auth-repository.dto'

type UsersCreateInput = Prisma.UsersCreateInput

const HISTORY_TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  city: true,
  offeredPrice: true,
  chargedAmount: true,
  proxyEarnings: true,
  createdAt: true,
  completedAt: true,
  canceledAt: true,
} satisfies Prisma.TasksSelect

type PasswordResetCodeState = 'pending' | 'verified' | 'used'

type PasswordResetCode = {
  id: string
  userId: string
  code: string
  expiresAt: Date
  state: PasswordResetCodeState
  attempts: number
  createdAt: Date
}

class DeletionBlockedError extends Error {}

export class ResetCodeNotUsableError extends Error {
  constructor() {
    super('Reset code is no longer usable')
  }
}

@Injectable()
export class AuthRepository implements AuthRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string): Promise<FindUserByEmailResult | null> {
    return this.prisma.users.findUnique({
      where: { email },
    })
  }

  async create(data: UsersCreateInput): Promise<{ id: string }> {
    return this.prisma.users.create({ data, select: { id: true } })
  }

  async updateStripeCustomerId(
    userId: string,
    stripeCustomerId: string,
  ): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { stripeCustomerId },
    })
  }

  // Only used to roll back a sign-up whose Stripe customer could not be created.
  async hardDeleteUser(userId: string): Promise<void> {
    await this.prisma.users.delete({ where: { id: userId } })
  }

  async findUserStripeCustomerId(userId: string): Promise<string | null> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    })

    return user?.stripeCustomerId || null
  }

  async fetchPhoneNumberById(userId: string): Promise<string | null> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    })

    return user?.phoneNumber ?? null
  }

  async fetchUserDetailsById(
    userId: string,
  ): Promise<FindUserByEmailResult | null> {
    return this.prisma.users.findUnique({ where: { id: userId } })
  }

  async updateStripeAccountId(
    userId: string,
    stripeAccountId: string,
  ): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { stripeAccountId },
    })
  }

  async fetchTasksCreatedByUser(
    userId: string,
    page: HistoryPage,
  ): Promise<HistoryTaskRow[]> {
    return this.prisma.tasks.findMany({
      where: { owner: userId },
      select: HISTORY_TASK_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: page.skip,
      take: page.take,
    })
  }

  async fetchTasksExecutedByUser(
    userId: string,
    page: HistoryPage,
  ): Promise<HistoryTaskRow[]> {
    return this.prisma.tasks.findMany({
      where: {
        userTaskMappings: { some: { executorId: userId } },
        status: { in: ['completed', 'canceled', 'payout_failed'] },
      },
      select: HISTORY_TASK_SELECT,
      orderBy: { updatedAt: 'desc' },
      skip: page.skip,
      take: page.take,
    })
  }

  async updateUserDetailsById(
    userId: string,
    data: UpdateUserProfileRepositoryPayload,
  ): Promise<void> {
    await this.prisma.users.update({ where: { id: userId }, data })
  }

  async deleteAccount(userId: string): Promise<DeleteAccountResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Lock order: the per-user advisory lock (the one RefreshTokensRepository
        // and the reset transaction take) comes first, before any users/tasks/cards write.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

        const now = new Date()
        // Cancel first, then count: a concurrent claim (available -> in_progress)
        // either landed before the cancel (and is counted below) or loses the CAS.
        await tx.tasks.updateMany({
          where: { owner: userId, status: 'available' },
          data: { status: 'canceled', canceledAt: now },
        })
        const blocking = await tx.tasks.count({
          where: {
            status: { in: DELETION_BLOCKING_STATUSES },
            OR: [
              { owner: userId },
              { userTaskMappings: { some: { executorId: userId } } },
            ],
          },
        })
        if (blocking > 0) throw new DeletionBlockedError()

        await tx.refreshTokens.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        })

        const cards = await tx.cards.findMany({
          where: { userId, isDeleted: false },
          select: { stripeCardId: true },
        })
        await tx.cards.updateMany({
          where: { userId, isDeleted: false },
          data: { isDeleted: true },
        })

        const current = await tx.users.findUnique({
          where: { id: userId },
          select: { stripeCustomerId: true },
        })
        const { count } = await tx.users.updateMany({
          where: { id: userId, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: now,
            name: 'Conta removida',
            email: `deleted-${userId}@deleted.local`,
            phoneNumber: null,
            avatarUrl: null,
            password: '!deleted',
          },
        })
        if (count === 0) return { status: 'already_deleted' as const }

        return {
          status: 'deleted' as const,
          stripeCardIds: cards.map((card) => card.stripeCardId),
          stripeCustomerId: current?.stripeCustomerId ?? null,
        }
      })
    } catch (error) {
      if (error instanceof DeletionBlockedError) {
        return { status: 'blocked' }
      }
      throw error
    }
  }

  async createPasswordResetCode(
    userId: string,
    code: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      await tx.passwordResetCodes.updateMany({
        where: { userId, state: 'pending' },
        data: { state: 'used' },
      })

      await tx.passwordResetCodes.create({
        data: { userId, code, expiresAt },
      })
    })
  }

  /**
   * Fresh, never-verified code that can be consumed by `verify-reset-code`.
   */
  async findPendingResetCode(
    userId: string,
  ): Promise<PasswordResetCode | null> {
    return this.prisma.passwordResetCodes.findFirst({
      where: {
        userId,
        state: 'pending',
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_RESET_CODE_ATTEMPTS },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Atomically reserves one guess against the code (before the bcrypt compare),
   * so parallel requests cannot exceed MAX_RESET_CODE_ATTEMPTS.
   */
  async reservePasswordResetAttempt(
    codeId: string,
    state: 'pending' | 'verified' = 'pending',
  ): Promise<boolean> {
    const { count } = await this.prisma.passwordResetCodes.updateMany({
      where: { id: codeId, state, attempts: { lt: MAX_RESET_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    })

    return count === 1
  }

  /**
   * Already-verified code that has not yet been used to reset the password.
   */
  async findVerifiedResetCode(
    userId: string,
  ): Promise<PasswordResetCode | null> {
    return this.prisma.passwordResetCodes.findFirst({
      where: {
        userId,
        state: 'verified',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async countRecentPasswordResetCodes(userId: string): Promise<number> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

    return this.prisma.passwordResetCodes.count({
      where: {
        userId,
        createdAt: { gte: fifteenMinutesAgo },
      },
    })
  }

  async markPasswordResetCodeAsVerified(codeId: string): Promise<boolean> {
    const { count } = await this.prisma.passwordResetCodes.updateMany({
      where: { id: codeId, state: 'pending' },
      data: { state: 'verified', attempts: 0 },
    })

    return count === 1
  }

  /**
   * Atomically updates the user's password AND transitions the reset code
   * to `used`, in a single Prisma transaction. Either both succeed or both
   * roll back — prevents the code from being reusable if the second write
   * fails.
   */
  async resetPasswordWithCode(
    userId: string,
    hashedPassword: string,
    codeId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const updated = await tx.users.updateMany({
        where: { id: userId, isDeleted: false },
        data: { password: hashedPassword },
      })
      if (updated.count === 0) {
        throw new ResetCodeNotUsableError()
      }
      const consumed = await tx.passwordResetCodes.updateMany({
        where: { id: codeId, state: 'verified' },
        data: { state: 'used' },
      })
      if (consumed.count === 0) {
        throw new ResetCodeNotUsableError()
      }
      await tx.refreshTokens.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    })
  }

  async updateUserPassword(
    userId: string,
    hashedPassword: string,
  ): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })
  }
}
