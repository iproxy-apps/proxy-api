import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'

import { EnvService } from 'src/env/env.service'
import { StripeModule } from 'src/stripe/stripe.module'
import { PrismaService } from 'src/prisma/prisma.service'
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
import { FinishTaskController } from './controllers/finish-task.controller'
import { CancelTaskController } from './controllers/cancel-task.controller'
import { PaymentsRepository } from '../payments/repository/payments.repository'
import { ValidateTaskController } from './controllers/validate-task.controller'
import { FetchUserCardService } from '../cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from '../auth/use-cases/fetch-user-details.service'
import { UpdateWalletBalanceService } from '../auth/use-cases/update-wallet-balance.service'
import { CreateUserSourceService } from '../cards/use-cases/create-user-payment-method.service'
import { CreatePaymentRecordService } from '../payments/use-cases/create-payment-record.service'
import { UpdateTotalTasksCreatedService } from '../auth/use-cases/update-total-tasks-created.service'
import { UpdateTotalTasksCompletedService } from '../auth/use-cases/update-total-tasks-completed.service'

import { multerOptions } from 'src/pipes/multer-validation.pipe'
import { FetchPaymentRecordService } from '../payments/use-cases/fetch-payment-record.service'
import { UpdatePaymentRecordService } from '../payments/use-cases/update-payment-record.service'

@Module({
  imports: [StripeModule.forRoot(), MulterModule.register(multerOptions)],
  providers: [
    EnvService,
    PrismaService,
    AuthRepository,
    TasksRepository,
    CardsRepository,
    StartTaskService,
    CreateTaskService,
    CancelTaskService,
    FetchTasksService,
    FinishTaskService,
    PaymentsRepository,
    ValidateTaskService,
    FetchUserCardService,
    FetchUserDetailsService,
    CreateUserSourceService,
    FetchPaymentRecordService,
    UpdatePaymentRecordService,
    CreatePaymentRecordService,
    UpdateWalletBalanceService,
    UpdateTotalTasksCreatedService,
    UpdateTotalTasksCompletedService,
  ],
  controllers: [
    StartTaskController,
    CreateTaskController,
    FetchTasksController,
    FinishTaskController,
    CancelTaskController,
    ValidateTaskController,
  ],
})
export class TasksModule {}
