import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'

import { AppModule } from 'src/app.module'
import { PrismaService } from 'src/prisma/prisma.service'
import { assertTestDatabaseUrl } from './assert-test-database-url'
import { TRUNCATE_TABLES } from 'src/modules/test-hooks/truncate-tables'
import { StripeService } from 'src/stripe/stripe.service'
import { configureApp } from 'src/configure-app'
import { NotificationService } from 'src/notification/notification.service'

import { createNotificationServiceMock } from '../mocks/notification.service.mock'
import { createStripeServiceMock } from '../mocks/stripe.service.mock'

export type TestAppContext = {
  app: INestApplication
  prisma: PrismaService
  stripeMock: jest.Mocked<StripeService>
  notificationMock: jest.Mocked<NotificationService>
}

export const createTestApp = async (
  options: { trustProxy?: number } = {},
): Promise<TestAppContext> => {
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
  configureApp(app, { trustProxy: options.trustProxy ?? 0 })
  await app.init()

  const prisma = app.get(PrismaService)

  return { app, prisma, stripeMock, notificationMock }
}

export const resetDatabase = async (prisma: PrismaService): Promise<void> => {
  assertTestDatabaseUrl(process.env.DATABASE_URL)
  const tables = TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  )
}
