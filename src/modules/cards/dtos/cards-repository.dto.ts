import type {
  UserCard,
  CreateUserSourceData,
  UpdateUserSourceData,
} from '../types'

export interface CardsRepositoryDTO {
  createUserSource: (data: CreateUserSourceData) => Promise<UserCard>
  fetchUserCard: (userId: string) => Promise<UserCard | null>
  fetchCardById: (id: string) => Promise<UserCard | null>
  updateUserSource: (data: UpdateUserSourceData) => Promise<UserCard>
  softDeleteCard: (id: string) => Promise<void>
}
