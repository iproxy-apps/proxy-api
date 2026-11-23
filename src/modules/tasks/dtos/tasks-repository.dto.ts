import type {
  ClaimTaskData,
  InsertTaskData,
  TaskCounterpart,
  FetchTasksResult,
  ReleaseClaimData,
  RecordTransferData,
  TransitionTaskData,
  CreateTaskResult,
  FetchTaskByIdData,
  FetchTasksQueryData,
  TaskStatus,
  UpdateTaskStatusData,
  ValidateTaskCompletionData,
  FetchTaskUserMappingQueryData,
} from '../types'

export interface TasksRepositoryDTO {
  createTask: (data: InsertTaskData) => Promise<CreateTaskResult>
  fetchAllTasks: (data: FetchTasksQueryData) => Promise<FetchTasksResult[]>
  fetchActiveTasksForUser: (userId: string) => Promise<FetchTasksResult[]>
  updateTaskStatus: (data: UpdateTaskStatusData) => Promise<void>
  insertTaskUserMapping: (taskId: string, executorId: string) => Promise<void>
  fetchTaskById: (data: FetchTaskByIdData) => Promise<FetchTasksResult | null>
  fetchTaskByTransferId: (
    transferId: string,
  ) => Promise<FetchTasksResult | null>
  fetchTaskMappingByTaskId: (
    taskId: string,
  ) => Promise<FetchTaskUserMappingQueryData | null>
  fetchTaskCounterpartById: (userId: string) => Promise<TaskCounterpart | null>
  validateTaskCompletion: (data: ValidateTaskCompletionData) => Promise<void>
  markPayoutFailed: (taskId: string) => Promise<void>
  transition: (data: TransitionTaskData) => Promise<boolean>
  claimTask: (data: ClaimTaskData) => Promise<boolean>
  releaseClaim: (data: ReleaseClaimData) => Promise<boolean>
  fetchClaim: (taskId: string) => Promise<{
    status: TaskStatus
    startedAt: Date | null
    executorId: string | null
  } | null>
  flagCardActionRequired: (userId: string) => Promise<void>
  recordTransfer: (data: RecordTransferData) => Promise<void>
}
