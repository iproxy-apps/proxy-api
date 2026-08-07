import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  InsertTaskData,
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
}
