import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type { CreateRatingData } from '../types'
import type { RatingsRepositoryDTO } from '../dtos/ratings-repository.dto'

@Injectable()
export class RatingsRepository implements RatingsRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async createRating(data: CreateRatingData): Promise<void> {
    const { taskId, raterId, ratedId, score, comment } = data
    await this.prisma.ratings.create({
      data: { taskId, raterId, ratedId, score, comment },
    })
  }

  async averageScoreForUser(userId: string): Promise<number> {
    const result = await this.prisma.ratings.aggregate({
      where: { ratedId: userId },
      _avg: { score: true },
    })
    return result._avg.score ?? 0
  }

  async setUserRating(userId: string, rating: number): Promise<void> {
    await this.prisma.users.update({
      where: { id: userId },
      data: { rating },
    })
  }
}
