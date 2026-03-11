import type {
  UserCard,
  CreateUserSourceData,
  UpdateUserSourceData,
} from '../types'

export interface CardsRepositoryDTO {
  createUserSource: (data: CreateUserSourceData) => Promise<void>
  fetchUserCard: (userId: string) => Promise<UserCard | null>
  updateUserSource: (data: UpdateUserSourceData) => Promise<void>
}
