import type {
  ClaimTaskData,
  InsertTaskData,
  PublicUser,
  TaskRow,
  ReleaseClaimData,
  RecordTransferData,
  StaleTask,
  TransitionTaskData,
  CreateTaskResult,
  FetchTaskByIdData,
  FetchTasksQueryData,
  TaskStatus,
  FetchTaskUserMappingQueryData,
} from '../types'

export interface TasksRepositoryDTO {
  createTask: (data: InsertTaskData) => Promise<CreateTaskResult>
  fetchAllTasks: (data: FetchTasksQueryData) => Promise<TaskRow[]>
  fetchActiveTasksForUser: (userId: string) => Promise<TaskRow[]>
  insertTaskUserMapping: (taskId: string, executorId: string) => Promise<void>
  fetchTaskById: (data: FetchTaskByIdData) => Promise<TaskRow | null>
  fetchTaskMappingByTaskId: (
    taskId: string,
  ) => Promise<FetchTaskUserMappingQueryData | null>
  fetchTaskCounterpartById: (userId: string) => Promise<PublicUser | null>
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
  findStaleVerificationRequired: (completedBefore: Date) => Promise<StaleTask[]>
}
