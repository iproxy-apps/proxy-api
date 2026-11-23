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
  ])('%s skips every named throttler', (_, controller) => {
    for (const name of ['default', 'auth']) {
      expect(Reflect.getMetadata(THROTTLER_SKIP + name, controller)).toBe(true)
    }
  })
})
