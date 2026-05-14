import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  FindUserByEmailResult,
  UpdateUserProfileRepositoryPayload,
  UsersUpdateInput,
} from '../types'
import type {
  AuthRepositoryDTO,
  TransactionHistoryTask,
} from '../dtos/auth-repository.dto'

type UsersCreateInput = Prisma.UsersCreateInput

type PasswordResetCode = {
  id: string
  userId: string
  code: string
  expiresAt: Date
  used: boolean
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

  async updateTotalTasksCompleted(userId: string, by: number): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { totalTasksCompleted: { increment: by } },
    })
  }

  async updateTotalTasksCreated(userId: string, by: number): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { totalTasksCreated: { increment: by } },
    })
  }

  async updateWalletBalance(
    userId: string,
    walletBalance: number,
  ): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { walletBalance },
    })
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

  async findValidPasswordResetCode(
    userId: string,
  ): Promise<PasswordResetCode | null> {
    return this.prisma.passwordResetCodes.findFirst({
      where: {
        userId,
        used: false,
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

  async markPasswordResetCodeAsUsed(codeId: string): Promise<void> {
    await this.prisma.passwordResetCodes.update({
      where: { id: codeId },
      data: { used: true },
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
