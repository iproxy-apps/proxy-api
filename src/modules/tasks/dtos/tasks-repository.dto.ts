import type {
  InsertTaskData,
  TaskCounterpart,
  FetchTasksResult,
  CreateTaskResult,
  FetchTaskByIdData,
  FetchTasksQueryData,
  UpdateTaskStatusData,
  ValidateTaskCompletionData,
  FetchTaskUserMappingQueryData,
} from '../types'

export interface TasksRepositoryDTO {
  create: (data: InsertTaskData) => Promise<CreateTaskResult>
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
}
