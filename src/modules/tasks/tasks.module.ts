import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'

import { EnvService } from 'src/env/env.service'
import { StripeModule } from 'src/stripe/stripe.module'
import { NotificationModule } from 'src/notification/notification.module'
import { RatingsModule } from '../ratings/ratings.module'
import { PaymentsModule } from '../payments/payments.module'
import { TasksRepository } from './repository/tasks.repository'
import { StartTaskService } from './use-cases/start-task.service'
import { CancelTaskService } from './use-cases/cancel-task.service'
import { FinishTaskService } from './use-cases/finish-task.service'
import { CreateTaskService } from './use-cases/create-task.service'
import { FetchTasksService } from './use-cases/fetch-tasks.service'
import { AuthRepository } from '../auth/repository/auth.repository'
import { ValidateTaskService } from './use-cases/validate-task.service'
import { CardsRepository } from '../cards/repositories/cards.repository'
import { StartTaskController } from './controllers/start-task.controller'
import { CreateTaskController } from './controllers/create-task.controller'
import { FetchTasksController } from './controllers/fetch-tasks.controller'
import { FetchTaskByIdService } from './use-cases/fetch-task-by-id.service'
import { PricePreviewService } from './use-cases/price-preview.service'
import { FetchTaskProofService } from './use-cases/fetch-task-proof.service'
import { FetchActiveTasksService } from './use-cases/fetch-active-tasks.service'
import { FinishTaskController } from './controllers/finish-task.controller'
import { FetchTaskProofController } from './controllers/fetch-task-proof.controller'
import { CancelTaskController } from './controllers/cancel-task.controller'
import { ValidateTaskController } from './controllers/validate-task.controller'
import { FetchUserCardService } from '../cards/use-cases/fetch-user-card.service'
import { PricePreviewController } from './controllers/price-preview.controller'
import { FetchTaskByIdController } from './controllers/fetch-task-by-id.controller'
import { FetchActiveTasksController } from './controllers/fetch-active-tasks.controller'
import { FetchUserDetailsService } from '../auth/use-cases/fetch-user-details.service'
import { UpdateWalletBalanceService } from '../auth/use-cases/update-wallet-balance.service'
import { SaveCardService } from '../cards/use-cases/save-card.service'
import { UpdateTotalTasksCompletedService } from '../auth/use-cases/update-total-tasks-completed.service'

import { multerOptions } from 'src/pipes/multer-validation.pipe'

@Module({
  imports: [
    StripeModule.forRoot(),
    NotificationModule.forRoot(),
    MulterModule.register(multerOptions),
    RatingsModule,
    PaymentsModule,
  ],
  providers: [
    EnvService,
    AuthRepository,
    TasksRepository,
    CardsRepository,
    StartTaskService,
    CreateTaskService,
    CancelTaskService,
    FetchTasksService,
    FetchActiveTasksService,
    FinishTaskService,
    ValidateTaskService,
    FetchUserCardService,
    FetchTaskByIdService,
    PricePreviewService,
    FetchTaskProofService,
    FetchUserDetailsService,
    SaveCardService,
    UpdateWalletBalanceService,
    UpdateTotalTasksCompletedService,
  ],
  controllers: [
    StartTaskController,
    CreateTaskController,
    FetchTasksController,
    FetchActiveTasksController,
    FinishTaskController,
    CancelTaskController,
    ValidateTaskController,
    PricePreviewController,
    FetchTaskByIdController,
    FetchTaskProofController,
  ],
})
export class TasksModule {}
