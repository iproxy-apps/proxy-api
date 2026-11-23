import { AppException } from 'src/exception/app.exception'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns ok when the database answers', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    }
    const controller = new HealthController(prisma as never)
    await expect(controller.handle()).resolves.toEqual({ status: 'ok' })
  })

  it('returns 503 HEALTH_DATABASE_UNAVAILABLE when the database fails', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) }
    const controller = new HealthController(prisma as never)
    const promise = controller.handle()
    await expect(promise).rejects.toBeInstanceOf(AppException)
    await expect(promise).rejects.toMatchObject({
      errorCode: 'HEALTH_DATABASE_UNAVAILABLE',
    })
    await promise.catch((e: AppException) => expect(e.getStatus()).toBe(503))
  })
})
