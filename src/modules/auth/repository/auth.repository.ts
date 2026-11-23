import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  FindUserByEmailResult,
  UpdateUserProfileRepositoryPayload,
} from '../types'
import type {
  AuthRepositoryDTO,
  TransactionHistoryTask,
} from '../dtos/auth-repository.dto'

type UsersCreateInput = Prisma.UsersCreateInput

type PasswordResetCodeState = 'pending' | 'verified' | 'used'

type PasswordResetCode = {
  id: string
  userId: string
  code: string
  expiresAt: Date
  state: PasswordResetCodeState
  createdAt: Date
}

@Injectable()
export class AuthRepository implements AuthRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string): Promise<FindUserByEmailResult | null> {
    return this.prisma.users.findUnique({
      where: { email },
    })
  }

  async create(data: UsersCreateInput): Promise<UsersCreateInput> {
    return this.prisma.users.create({ data })
  }

  async findUserStripeCustomerId(userId: string): Promise<string | null> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    })

    return user?.stripeCustomerId || null
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
  ): Promise<TransactionHistoryTask[]> {
    return this.prisma.tasks.findMany({
      where: { owner: userId },
      select: {
        id: true,
        title: true,
        description: true,
        offeredPrice: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async fetchTasksCompletedByUser(
    userId: string,
  ): Promise<TransactionHistoryTask[]> {
    return this.prisma.tasks.findMany({
      where: {
        userTaskMappings: { some: { executorId: userId } },
        status: 'completed',
      },
      select: {
        id: true,
        title: true,
        description: true,
        offeredPrice: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { completedAt: 'desc' },
    })
  }

  async updateUserDetailsById(
    userId: string,
    data: UpdateUserProfileRepositoryPayload,
  ): Promise<void> {
    await this.prisma.users.update({ where: { id: userId }, data })
  }

  async softDeleteUser(userId: string): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        name: 'Conta removida',
        email: `deleted-${userId}@deleted.local`,
        phoneNumber: null,
        avatarUrl: null,
        documentUrl: null,
        documentType: null,
      },
    })
  }

  async createPasswordResetCode(
    userId: string,
    code: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.passwordResetCodes.create({
      data: { userId, code, expiresAt },
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
      },
      orderBy: { createdAt: 'desc' },
    })
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

  async markPasswordResetCodeAsVerified(codeId: string): Promise<void> {
    await this.prisma.passwordResetCodes.update({
      where: { id: codeId },
      data: { state: 'verified' },
    })
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
    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetCodes.update({
        where: { id: codeId },
        data: { state: 'used' },
      }),
    ])
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
