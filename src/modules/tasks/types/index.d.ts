export type TaskStatus =
  | 'available'
  | 'accepted'
  | 'on_the_way'
  | 'in_progress'
  | 'verification_required'
  | 'completed'
  | 'canceled'

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
  token?: string
}

export type InsertTaskData = {
  title: string
  userId: string
  description: string
  locationLat: number
  locationLng: number
  offeredPrice: number
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
  status: TaskStatus
}

export type FetchTasksResult = {
  title: string
  description: string
  locationLat: Decimal
  locationLng: Decimal
  offeredPrice: Decimal
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
  owner: string
  title: string
  description: string
  locationLat: Decimal
  locationLng: Decimal
  locationAddress: string
  offeredPrice: Decimal
  proxyEarnings: Decimal | null
  platformFee: Decimal | null
  status: TaskStatus
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type StartTaskData = {
  taskId: string
  userId: string
}

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
}

export type ValidateTaskCompletionData = {
  taskId: string
  status: TaskStatus
  completedAt: Date
  platformFee: number
  proxyEarnings: number
}

export type CancelTaskData = {
  taskId: string
  userId: string
}
