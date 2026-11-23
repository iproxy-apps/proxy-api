import { compare } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { EnvService } from 'src/env/env.service'
import { ForgotPasswordService } from './forgot-password.service'
import { NotificationService } from 'src/notification/notification.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<
    AuthRepository,
    'findByEmail' | 'countRecentPasswordResetCodes' | 'createPasswordResetCode'
  >
>

type NotificationServiceMock = jest.Mocked<
  Pick<NotificationService, 'sendResetCodeByEmail'>
>

type EnvServiceMock = jest.Mocked<Pick<EnvService, 'get'>>

const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  expect(condition()).toBe(true)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

const SILENT_MESSAGE =
  'Se o email existir, um código de recuperação será enviado.'

describe('ForgotPasswordService', () => {
  let service: ForgotPasswordService
  let authRepository: AuthRepositoryMock
  let notificationService: NotificationServiceMock
  let env: EnvServiceMock

  beforeEach(() => {
    authRepository = {
      findByEmail: jest.fn(),
      createPasswordResetCode: jest.fn(),
      countRecentPasswordResetCodes: jest.fn(),
    }
    notificationService = { sendResetCodeByEmail: jest.fn() }
    env = {
      get: jest.fn().mockReturnValue('test'),
    } as unknown as EnvServiceMock

    service = new ForgotPasswordService(
      authRepository as unknown as AuthRepository,
      notificationService as unknown as NotificationService,
      env as unknown as EnvService,
    )
  })

  it('returns a silent success message when the user does not exist', async () => {
    authRepository.findByEmail.mockResolvedValue(null)

    const result = await service.execute({ email: 'missing@test.io' })

    expect(result).toEqual({ message: SILENT_MESSAGE })
    expect(authRepository.countRecentPasswordResetCodes).not.toHaveBeenCalled()
    expect(authRepository.createPasswordResetCode).not.toHaveBeenCalled()
    expect(notificationService.sendResetCodeByEmail).not.toHaveBeenCalled()
  })

  it('returns the generic message and sends nothing when user has 3 or more recent codes', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(3)

    await expect(service.execute({ email: 'user@test.io' })).resolves.toEqual({
      message: SILENT_MESSAGE,
    })

    await waitFor(
      () => authRepository.countRecentPasswordResetCodes.mock.calls.length > 0,
    )
    await settle()

    expect(authRepository.createPasswordResetCode).not.toHaveBeenCalled()
    expect(notificationService.sendResetCodeByEmail).not.toHaveBeenCalled()
  })

  it('stores a hashed code with a 15-minute expiration and emails the plaintext', async () => {
    const user = makeUser()
    authRepository.findByEmail.mockResolvedValue(user)
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(0)

    const before = Date.now()
    const result = await service.execute({ email: 'user@test.io' })

    expect(result).toEqual({ message: SILENT_MESSAGE })

    await waitFor(
      () => authRepository.createPasswordResetCode.mock.calls.length === 1,
    )
    const after = Date.now()
    expect(authRepository.createPasswordResetCode).toHaveBeenCalledTimes(1)
    const [userIdArg, hashedCode, expiresAt] =
      authRepository.createPasswordResetCode.mock.calls[0]

    expect(userIdArg).toBe(user.id)

    const expiresMs = (expiresAt as Date).getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 15 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 15 * 60 * 1000)

    expect(notificationService.sendResetCodeByEmail).toHaveBeenCalledTimes(1)
    const [emailArg, plainCode, nameArg] =
      notificationService.sendResetCodeByEmail.mock.calls[0]

    expect(emailArg).toBe(user.email)
    expect(nameArg).toBe(user.name)
    expect(plainCode).toMatch(/^\d{6}$/)

    expect(hashedCode).not.toBe(plainCode)
    await expect(compare(plainCode, hashedCode as string)).resolves.toBe(true)
  })

  it('returns the generic message and persists nothing when the notification service fails', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(0)
    notificationService.sendResetCodeByEmail.mockRejectedValue(
      new Error('ses down'),
    )

    await expect(service.execute({ email: 'user@test.io' })).resolves.toEqual({
      message: SILENT_MESSAGE,
    })

    await waitFor(
      () => notificationService.sendResetCodeByEmail.mock.calls.length === 1,
    )
    await settle()

    expect(authRepository.createPasswordResetCode).not.toHaveBeenCalled()
  })

  it('answers before the detached job counts, sends or persists', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())

    await service.execute({ email: 'user@test.io' })

    expect(authRepository.countRecentPasswordResetCodes).not.toHaveBeenCalled()
    expect(notificationService.sendResetCodeByEmail).not.toHaveBeenCalled()
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(3)
    await settle()
  })

  it('returns the generic message when persisting the code fails after sending', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(0)
    authRepository.createPasswordResetCode.mockRejectedValue(
      new Error('db down'),
    )

    await expect(service.execute({ email: 'user@test.io' })).resolves.toEqual({
      message: SILENT_MESSAGE,
    })

    await waitFor(
      () => authRepository.createPasswordResetCode.mock.calls.length === 1,
    )
  })
})
