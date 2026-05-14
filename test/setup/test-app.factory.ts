import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'

import { AppModule } from 'src/app.module'
import { PrismaService } from 'src/prisma/prisma.service'
import { StripeService } from 'src/stripe/stripe.service'
import { HttpExceptionFilter } from 'src/exception/http.exception'
import { NotificationService } from 'src/notification/notification.service'

import { createNotificationServiceMock } from '../mocks/notification.service.mock'
import { createStripeServiceMock } from '../mocks/stripe.service.mock'

export type TestAppContext = {
  app: INestApplication
  prisma: PrismaService
  stripeMock: jest.Mocked<StripeService>
  notificationMock: jest.Mocked<NotificationService>
}

const TRUNCATE_TABLES = [
  'cards',
  'tasks',
  'users',
  'ratings',
  'payments',
  'stripe_events',
  'user_task_mapping',
  'password_reset_codes',
]

export const createTestApp = async (): Promise<TestAppContext> => {
  const stripeMock = createStripeServiceMock()
  const notificationMock = createNotificationServiceMock()

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StripeService)
    .useValue(stripeMock)
    .overrideProvider(NotificationService)
    .useValue(notificationMock)
    .compile()

  const app = moduleRef.createNestApplication({ logger: false, rawBody: true })
  app.useGlobalFilters(new HttpExceptionFilter())
  await app.init()

  const prisma = app.get(PrismaService)

  return { app, prisma, stripeMock, notificationMock }
}

export const resetDatabase = async (prisma: PrismaService): Promise<void> => {
  const tables = TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  )
}
