import { Injectable } from '@nestjs/common'

import { RatingsRepository } from '../repository/ratings.repository'

import type { CreateRatingData } from '../types'

@Injectable()
export class RateProxyService {
  constructor(private ratingsRepository: RatingsRepository) {}

  async execute(data: CreateRatingData): Promise<void> {
    await this.ratingsRepository.createRating(data)

    const average = await this.ratingsRepository.averageScoreForUser(
      data.ratedId,
    )
    await this.ratingsRepository.setUserRating(data.ratedId, average)
  }
}
