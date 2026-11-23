import 'reflect-metadata'
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants'

import { ResetController } from './controllers/reset.controller'
import { SeedUserController } from './controllers/seed-user.controller'
import { MarkAccountReadyController } from './controllers/mark-account-ready.controller'

describe('test hooks throttling', () => {
  it.each([
    ['ResetController', ResetController],
    ['SeedUserController', SeedUserController],
    ['MarkAccountReadyController', MarkAccountReadyController],
  ])('%s skips the default throttler', (_, controller) => {
    expect(Reflect.getMetadata(THROTTLER_SKIP + 'default', controller)).toBe(true)
  })
})
