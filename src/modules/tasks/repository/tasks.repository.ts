import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  ClaimTaskData,
  InsertTaskData,
  ReleaseClaimData,
  RecordTransferData,
  StaleTask,
  TransitionTaskData,
  TaskStatus,
  PublicUser,
  TaskRow,
  CreateTaskResult,
  FetchTaskByIdData,
  FetchTasksQueryData,
  FetchTaskUserMappingQueryData,
} from '../types'
import { publicUserSelect, taskSelect } from './task-select'
import type { TasksRepositoryDTO } from '../dtos/tasks-repository.dto'

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
      city,
      state,
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
          city,
          state,
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
    take,
  }: FetchTasksQueryData): Promise<TaskRow[]> {
    return await this.prisma.tasks.findMany({
      select: taskSelect,
      where: {
        status: 'available',
        ownerId: { isDeleted: false },
        // exact canonical match: rows backfilled by P2-T11 with raw city text will not appear until normalised
        city,
      },
      orderBy: { createdAt: 'desc' },
      take,
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
  ): Promise<TaskRow | null> {
    return await this.prisma.tasks.findUnique({
      select: taskSelect,
      where: {
        id: data.taskId,
        status: data.status,
        ownerId: { isDeleted: false },
      },
    })
  }

  async fetchActiveTasksForUser(userId: string): Promise<TaskRow[]> {
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
  ): Promise<PublicUser | null> {
    return await this.prisma.users.findUnique({
      where: { id: userId },
      select: publicUserSelect,
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

  async findStaleVerificationRequired(
    completedBefore: Date,
  ): Promise<StaleTask[]> {
    return await this.prisma.tasks.findMany({
      where: {
        status: 'verification_required',
        completedAt: { lte: completedBefore },
      },
      select: { id: true, owner: true },
      orderBy: { completedAt: 'asc' },
      take: 200,
    })
  }
}
