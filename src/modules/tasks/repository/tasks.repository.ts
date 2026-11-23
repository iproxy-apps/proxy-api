import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  ClaimTaskData,
  InsertTaskData,
  ReleaseClaimData,
  RecordTransferData,
  TransitionTaskData,
  TaskCounterpart,
  FetchTasksResult,
  CreateTaskResult,
  FetchTaskByIdData,
  FetchTasksQueryData,
  UpdateTaskStatusData,
  FetchTaskUserMappingQueryData,
  ValidateTaskCompletionData,
} from '../types'
import type { TasksRepositoryDTO } from '../dtos/tasks-repository.dto'

@Injectable()
export class TasksRepository implements TasksRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async create(data: InsertTaskData): Promise<CreateTaskResult> {
    const {
      title,
      userId,
      description,
      offeredPrice,
      locationLat,
      locationLng,
      locationAddress,
    } = data
    return await this.prisma.tasks.create({
      data: {
        title,
        owner: userId,
        description,
        locationLat,
        locationLng,
        offeredPrice,
        locationAddress,
      },
    })
  }

  async fetchAllTasks({
    city,
    skip,
    perPage,
  }: FetchTasksQueryData): Promise<FetchTasksResult[]> {
    return await this.prisma.tasks.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        locationAddress: true,
        locationLat: true,
        locationLng: true,
        offeredPrice: true,
        proxyEarnings: true,
        platformFee: true,
        proofImageUrl: true,
        owner: true,
        createdAt: true,
        status: true,
        startedAt: true,
        ownerId: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            avatarUrl: true,
            isVerified: true,
            rating: true,
            totalTasksCompleted: true,
            totalTasksCreated: true,
            stripeCustomerId: true,
          },
        },
      },
      where: {
        status: 'available',
        ownerId: { isDeleted: false },
        locationAddress: { contains: city },
      },
      orderBy: { createdAt: 'desc' },
      take: perPage,
      skip,
    })
  }

  async updateTaskStatus(data: UpdateTaskStatusData): Promise<void> {
    await this.prisma.tasks.update({
      where: { id: data.taskId },
      data: {
        status: data.status,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        canceledAt: data.canceledAt,
        proofImageUrl: data.filePath,
      },
    })
  }

  async insertTaskUserMapping(
    taskId: string,
    executorId: string,
  ): Promise<void> {
    await this.prisma.userTaskMapping.create({
      data: {
        taskId,
        executorId,
      },
    })
  }

  async fetchTaskById(
    data: FetchTaskByIdData,
  ): Promise<FetchTasksResult | null> {
    return await this.prisma.tasks.findUnique({
      select: {
        id: true,
        title: true,
        description: true,
        locationAddress: true,
        locationLat: true,
        locationLng: true,
        offeredPrice: true,
        proxyEarnings: true,
        platformFee: true,
        proofImageUrl: true,
        owner: true,
        createdAt: true,
        status: true,
        startedAt: true,
        ownerId: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            avatarUrl: true,
            isVerified: true,
            rating: true,
            totalTasksCompleted: true,
            totalTasksCreated: true,
            stripeCustomerId: true,
          },
        },
      },
      where: {
        id: data.taskId,
        status: data.status,
        ownerId: { isDeleted: false },
      },
    })
  }

  async fetchActiveTasksForUser(userId: string): Promise<FetchTasksResult[]> {
    return await this.prisma.tasks.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        locationAddress: true,
        locationLat: true,
        locationLng: true,
        offeredPrice: true,
        proxyEarnings: true,
        platformFee: true,
        proofImageUrl: true,
        owner: true,
        createdAt: true,
        status: true,
        startedAt: true,
        ownerId: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            avatarUrl: true,
            isVerified: true,
            rating: true,
            totalTasksCompleted: true,
            totalTasksCreated: true,
            stripeCustomerId: true,
          },
        },
      },
      where: {
        ownerId: { isDeleted: false },
        OR: [
          {
            owner: userId,
            status: {
              in: [
                'available',
                'accepted',
                'on_the_way',
                'in_progress',
                'verification_required',
              ],
            },
          },
          {
            userTaskMappings: { some: { executorId: userId } },
            status: {
              in: [
                'accepted',
                'on_the_way',
                'in_progress',
                'verification_required',
              ],
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async fetchTaskMappingByTaskId(
    taskId: string,
  ): Promise<FetchTaskUserMappingQueryData | null> {
    return await this.prisma.userTaskMapping.findUnique({
      where: { taskId },
    })
  }

  async fetchTaskCounterpartById(
    userId: string,
  ): Promise<TaskCounterpart | null> {
    return await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        isVerified: true,
        rating: true,
      },
    })
  }

  async validateTaskCompletion(
    data: ValidateTaskCompletionData,
  ): Promise<void> {
    const { taskId, status, platformFee, proxyEarnings, transferId } = data
    await this.prisma.tasks.update({
      where: { id: taskId },
      data: {
        status,
        platformFee,
        proxyEarnings,
        transferId,
      },
    })
  }

  async fetchTaskByTransferId(
    transferId: string,
  ): Promise<FetchTasksResult | null> {
    return await this.prisma.tasks.findUnique({
      select: {
        id: true,
        title: true,
        description: true,
        locationAddress: true,
        locationLat: true,
        locationLng: true,
        offeredPrice: true,
        proxyEarnings: true,
        platformFee: true,
        proofImageUrl: true,
        owner: true,
        createdAt: true,
        status: true,
        startedAt: true,
        ownerId: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            avatarUrl: true,
            isVerified: true,
            rating: true,
            totalTasksCompleted: true,
            totalTasksCreated: true,
            stripeCustomerId: true,
          },
        },
      },
      where: { transferId },
    })
  }

  async markPayoutFailed(taskId: string): Promise<void> {
    await this.prisma.tasks.update({
      where: { id: taskId },
      data: { status: 'payout_failed', transferId: null },
    })
  }

  async transition(data: TransitionTaskData): Promise<boolean> {
    const result = await this.prisma.tasks.updateMany({
      where: { id: data.taskId, status: { in: data.from } },
      data: { status: data.to, ...data.data },
    })
    return result.count === 1
  }

  async claimTask(data: ClaimTaskData): Promise<boolean> {
    const { taskId, executorId, startedAt } = data
    return await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tasks.updateMany({
        where: { id: taskId, status: 'available' },
        data: { status: 'in_progress', startedAt },
      })
      if (claimed.count !== 1) return false
      await tx.userTaskMapping.deleteMany({ where: { taskId } })
      await tx.userTaskMapping.create({ data: { taskId, executorId } })
      return true
    })
  }

  async releaseClaim(data: ReleaseClaimData): Promise<boolean> {
    const { taskId, executorId, startedAt, cardActionOwnerId } = data
    return await this.prisma.$transaction(async (tx) => {
      const released = await tx.tasks.updateMany({
        where: { id: taskId, status: 'in_progress', startedAt },
        data: { status: 'available', startedAt: null },
      })
      if (released.count !== 1) return false
      await tx.userTaskMapping.deleteMany({ where: { taskId, executorId } })
      if (cardActionOwnerId) {
        await tx.users.update({
          where: { id: cardActionOwnerId },
          data: { cardActionRequired: true },
        })
      }
      return true
    })
  }

  async recordTransfer(data: RecordTransferData): Promise<void> {
    const { taskId, executorId, transferId, proxyEarnings } = data
    await this.prisma.$transaction([
      this.prisma.tasks.update({ where: { id: taskId }, data: { transferId } }),
      this.prisma.users.update({
        where: { id: executorId },
        data: {
          totalTasksCompleted: { increment: 1 },
          walletBalance: { increment: proxyEarnings },
        },
      }),
    ])
  }
}
