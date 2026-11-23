import type { Prisma } from '@prisma/client'
import type { PublicUser, TaskRow } from '../repository/task-select'

type Decimal = Prisma.Decimal

export type TaskStatus =
  | 'available'
  | 'accepted'
  | 'on_the_way'
  | 'in_progress'
  | 'verification_required'
  | 'completed'
  | 'canceled'
  | 'payout_failed'

export type PricePreview = {
  offeredPrice: number
  platformFee: number
  stripeFee: number
  chargedAmount: number
  proxyEarnings: number
}

export type CreateTaskData = {
  userId: string
  title: string
  description: string
  offeredPrice: number
  city: string
  state: string
  street?: string
  zipCode?: string
  complement?: string
  formattedAddress?: string
  locationLat: number
  locationLng: number

  savedCard?: string
  paymentMethodId?: string
}

export type InsertTaskData = {
  title: string
  userId: string
  description: string
  locationLat: number
  locationLng: number
  offeredPrice: Decimal
  platformFee: Decimal
  stripeFee: Decimal
  chargedAmount: Decimal
  proxyEarnings: Decimal
  locationAddress: string
  city: string
  state: string
}

export type FetchTasksData = {
  page: number
  city: string
}

export type FetchTasksQueryData = {
  city: string
  skip: number
  take: number
}

export type FetchTaskByIdData = {
  taskId: string
  status?: TaskStatus
}

export type { TaskRow, PublicUser }

export type PublicUserResponse = Omit<PublicUser, 'rating'> & {
  rating: number
}

export type TaskResponse = Omit<
  TaskRow,
  | 'locationLat'
  | 'locationLng'
  | 'offeredPrice'
  | 'platformFee'
  | 'stripeFee'
  | 'chargedAmount'
  | 'proxyEarnings'
  | 'ownerId'
> & {
  locationLat: number
  locationLng: number
  offeredPrice: number
  platformFee: number | null
  stripeFee: number | null
  chargedAmount: number | null
  proxyEarnings: number | null
  ownerId: PublicUserResponse
}

export type CreateTaskResult = {
  id: string
}

export type StartTaskData = {
  taskId: string
  userId: string
}

export type StartTaskResult = { status: 'succeeded' }

export type FinishTaskData = {
  taskId: string
  userId: string
  file: Express.Multer.File | null
}

export type FetchTaskUserMappingQueryData = {
  taskId: string
  executorId: string
  createdAt: Date
  updatedAt: Date
}

export type ValidateTaskData = {
  taskId: string
  userId: string
  rating?: number
  comment?: string
}

export type CancelTaskData = {
  taskId: string
  userId: string
}

export type TransitionTaskData = {
  taskId: string
  from: TaskStatus[]
  to: TaskStatus
  data?: {
    startedAt?: Date | null
    completedAt?: Date | null
    canceledAt?: Date | null
    proofImageUrl?: string | null
    transferId?: string | null
  }
}

export type ClaimTaskData = {
  taskId: string
  executorId: string
  startedAt: Date
}

export type ReleaseClaimData = {
  taskId: string
  executorId: string
  startedAt: Date
  cardActionOwnerId?: string
}

export type RecordTransferData = {
  taskId: string
  executorId: string
  transferId: string
  proxyEarnings: Decimal
}

export type StaleTask = {
  id: string
  owner: string
}

export type FetchTasksResponse = {
  items: TaskResponse[]
  page: number
  perPage: number
  hasMore: boolean
}
