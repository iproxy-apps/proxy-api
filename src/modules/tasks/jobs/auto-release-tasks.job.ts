import { subDays } from 'date-fns'
import { Cron } from '@nestjs/schedule'
import { Injectable, Logger } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { ValidateTaskService } from '../use-cases/validate-task.service'

export const AUTO_RELEASE_AFTER_DAYS = 7

@Injectable()
export class AutoReleaseTasksJob {
  private readonly logger = new Logger(AutoReleaseTasksJob.name)

  constructor(
    private tasksRepository: TasksRepository,
    private validateTaskService: ValidateTaskService,
  ) {}

  @Cron('0 3 * * *', {
    name: 'auto-release-tasks',
    timeZone: 'America/Sao_Paulo',
  })
  async run(): Promise<void> {
    try {
      await this.execute()
    } catch (error) {
      this.logger.error(`auto-release run failed: ${String(error)}`)
    }
  }

  async execute(
    now = new Date(),
  ): Promise<{ released: string[]; skipped: string[] }> {
    const cutoff = subDays(now, AUTO_RELEASE_AFTER_DAYS)
    const stale =
      await this.tasksRepository.findStaleVerificationRequired(cutoff)

    const released: string[] = []
    const skipped: string[] = []

    for (const { id, owner } of stale) {
      try {
        await this.validateTaskService.execute({ taskId: id, userId: owner })
        released.push(id)
      } catch (error) {
        const code =
          error instanceof AppException
            ? (error.errorCode ?? error.message)
            : error instanceof Error
              ? error.name
              : 'UNKNOWN'
        this.logger.warn(`auto-release skipped task ${id}: ${code}`)
        skipped.push(id)
      }
    }

    this.logger.log(
      `auto-release: ${released.length} released, ${skipped.length} skipped`,
    )
    return { released, skipped }
  }
}
