import 'reflect-metadata'
import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants'

import { AppModule } from 'src/app.module'
import { PrismaModule } from './prisma.module'
import { PrismaService } from './prisma.service'
import { AuthModule } from 'src/modules/auth/auth.module'
import { TasksModule } from 'src/modules/tasks/tasks.module'
import { CardsModule } from 'src/modules/cards/cards.module'
import { RatingsModule } from 'src/modules/ratings/ratings.module'
import { PaymentsModule } from 'src/modules/payments/payments.module'
import { PaymentsRepository } from 'src/modules/payments/repository/payments.repository'
import { TestHooksModule } from 'src/modules/test-hooks/test-hooks.module'
import { StripeWebhookModule } from 'src/modules/stripe-webhook/stripe-webhook.module'

const providersOf = (mod: object): unknown[] =>
  Reflect.getMetadata(MODULE_METADATA.PROVIDERS, mod) ?? []

describe('PrismaModule', () => {
  it('is global and exports a single PrismaService', () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, PrismaModule)).toBe(true)
    expect(providersOf(PrismaModule)).toEqual([PrismaService])
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PrismaModule)).toEqual([
      PrismaService,
    ])
  })

  it('is imported by AppModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(
      PrismaModule,
    )
  })

  it.each([
    ['AppModule', AppModule],
    ['AuthModule', AuthModule],
    ['TasksModule', TasksModule],
    ['CardsModule', CardsModule],
    ['PaymentsModule', PaymentsModule],
    ['RatingsModule', RatingsModule],
    ['StripeWebhookModule', StripeWebhookModule],
    ['TestHooksModule', TestHooksModule],
  ])('%s does not provide its own PrismaService', (_name, mod) => {
    expect(providersOf(mod)).not.toContain(PrismaService)
  })

  it('TasksModule gets the payments repository from PaymentsModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, TasksModule)).toContain(
      PaymentsModule,
    )
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, PaymentsModule),
    ).toEqual([PaymentsRepository])
  })
})
