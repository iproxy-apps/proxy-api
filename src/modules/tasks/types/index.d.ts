import type { Prisma } from '@prisma/client'

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
  street: string
  zipCode: string
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
}

export type FetchTasksData = {
  page: number
  city: string
}

export type FetchTasksQueryData = {
  perPage: number
  skip: number
  city: string
}

export type UpdateTaskStatusData = {
  taskId: string
  status: TaskStatus
  filePath?: string | null
  startedAt?: Date
  completedAt?: Date
  canceledAt?: Date
}

export type FetchTaskByIdData = {
  taskId: string
  status?: TaskStatus
}

export type FetchTasksResult = {
  title: string
  description: string
  locationLat: Decimal
  locationLng: Decimal
  offeredPrice: Decimal
  proxyEarnings: Decimal | null
  platformFee: Decimal | null
  stripeFee: Decimal | null
  chargedAmount: Decimal | null
  proofImageUrl: string | null
  id: string
  locationAddress: string
  status: TaskStatus
  createdAt: Date
  startedAt: Date | null
  ownerId: {
    name: string
    id: string
    email: string
    phoneNumber: string | null
    avatarUrl: string | null
    isVerified: boolean
    rating: Decimal
    totalTasksCompleted: number
    totalTasksCreated: number
    stripeCustomerId: string | null
  }
  owner: string
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

export type TaskCounterpart = {
  id: string
  name: string
  avatarUrl: string | null
  isVerified: boolean
  rating: Decimal
}

export type ValidateTaskData = {
  taskId: string
  userId: string
  rating?: number
  comment?: string
}

export type ValidateTaskCompletionData = {
  taskId: string
  status: TaskStatus
  platformFee: number
  proxyEarnings: number
  transferId?: string
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
