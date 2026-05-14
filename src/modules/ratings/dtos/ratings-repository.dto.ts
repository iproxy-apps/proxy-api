import type { CreateRatingData } from '../types'

export interface RatingsRepositoryDTO {
  createRating: (data: CreateRatingData) => Promise<void>
  averageScoreForUser: (userId: string) => Promise<number>
  setUserRating: (userId: string, rating: number) => Promise<void>
}
