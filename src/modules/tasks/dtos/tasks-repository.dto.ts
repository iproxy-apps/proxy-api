import type {
  InsertTaskData,
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
  updateTaskStatus: (data: UpdateTaskStatusData) => Promise<void>
  insertTaskUserMapping: (taskId: string, executorId: string) => Promise<void>
  fetchTaskById: (data: FetchTaskByIdData) => Promise<FetchTasksResult | null>
  fetchTaskMappingByTaskId: (
    taskId: string,
  ) => Promise<FetchTaskUserMappingQueryData | null>
  validateTaskCompletion: (data: ValidateTaskCompletionData) => Promise<void>
}
