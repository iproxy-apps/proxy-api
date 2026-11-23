import { Injectable } from '@nestjs/common'

import type { Prisma } from '@prisma/client'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  ClaimTaskData,
  InsertTaskData,
  ReleaseClaimData,
  RecordTransferData,
  TransitionTaskData,
  TaskStatus,
  TaskCounterpart,
  FetchTasksResult,
  CreateTaskResult,
  FetchTaskByIdData,
  FetchTasksQueryData,
  FetchTaskUserMappingQueryData,
} from '../types'
import type { TasksRepositoryDTO } from '../dtos/tasks-repository.dto'

export const taskSelect = {
  id: true,
  title: true,
  description: true,
  locationAddress: true,
  locationLat: true,
  locationLng: true,
  offeredPrice: true,
  proxyEarnings: true,
  platformFee: true,
  stripeFee: true,
  chargedAmount: true,
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
} satisfies Prisma.TasksSelect

@Injectable()
export class TasksRepository implements TasksRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async createTask(data: InsertTaskData): Promise<CreateTaskResult> {
    const {
      title,
      userId,
      description,
      offeredPrice,
      platformFee,
      stripeFee,
      chargedAmount,
      proxyEarnings,
      locationLat,
      locationLng,
      locationAddress,
    } = data
    const [task] = await this.prisma.$transaction([
      this.prisma.tasks.create({
        data: {
          title,
          owner: userId,
          description,
          locationLat,
          locationLng,
          offeredPrice,
          platformFee,
          stripeFee,
          chargedAmount,
          proxyEarnings,
          locationAddress,
        },
        select: { id: true },
      }),
      this.prisma.users.update({
        where: { id: userId },
        data: { totalTasksCreated: { increment: 1 } },
      }),
    ])
    return task
  }

  async fetchAllTasks({
    city,
    skip,
    perPage,
  }: FetchTasksQueryData): Promise<FetchTasksResult[]> {
    return await this.prisma.tasks.findMany({
      select: taskSelect,
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
      select: taskSelect,
      where: {
        id: data.taskId,
        status: data.status,
        ownerId: { isDeleted: false },
      },
    })
  }

  async fetchActiveTasksForUser(userId: string): Promise<FetchTasksResult[]> {
    return await this.prisma.tasks.findMany({
      select: taskSelect,
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

  async fetchClaim(taskId: string): Promise<{
    status: TaskStatus
    startedAt: Date | null
    executorId: string | null
  } | null> {
    return await this.prisma.$transaction(
      async (tx) => {
        const t = await tx.tasks.findUnique({
          where: { id: taskId },
          select: { status: true, startedAt: true },
        })
        if (!t) return null
        const m = await tx.userTaskMapping.findUnique({
          where: { taskId },
          select: { executorId: true },
        })
        return { ...t, executorId: m?.executorId ?? null }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async flagCardActionRequired(userId: string): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { cardActionRequired: true },
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
