import type {
  UserCard,
  CreateUserSourceData,
  ReplaceUserCardData,
} from '../types'

export interface CardsRepositoryDTO {
  createUserSource: (data: CreateUserSourceData) => Promise<UserCard>
  fetchUserCard: (userId: string) => Promise<UserCard | null>
  fetchCardById: (id: string) => Promise<UserCard | null>
  replaceUserCard: (
    data: ReplaceUserCardData,
  ) => Promise<{ card: UserCard; previousStripeCardId: string | null }>
  softDeleteCard: (id: string) => Promise<void>
}
