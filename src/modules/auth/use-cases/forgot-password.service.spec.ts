import { compare } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
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

const SILENT_MESSAGE =
  'Se o email existir, um código de recuperação será enviado.'

describe('ForgotPasswordService', () => {
  let service: ForgotPasswordService
  let authRepository: AuthRepositoryMock
  let notificationService: NotificationServiceMock

  beforeEach(() => {
    authRepository = {
      findByEmail: jest.fn(),
      createPasswordResetCode: jest.fn(),
      countRecentPasswordResetCodes: jest.fn(),
    }
    notificationService = { sendResetCodeByEmail: jest.fn() }

    service = new ForgotPasswordService(
      authRepository as unknown as AuthRepository,
      notificationService as unknown as NotificationService,
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

  it('throws tooManyRequests when user has 3 or more recent codes', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(3)

    await expect(
      service.execute({ email: 'user@test.io' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.tooManyRequests.errorCode,
    })

    expect(authRepository.createPasswordResetCode).not.toHaveBeenCalled()
    expect(notificationService.sendResetCodeByEmail).not.toHaveBeenCalled()
  })

  it('stores a hashed code with a 15-minute expiration and emails the plaintext', async () => {
    const user = makeUser()
    authRepository.findByEmail.mockResolvedValue(user)
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(0)

    const before = Date.now()
    const result = await service.execute({ email: 'user@test.io' })
    const after = Date.now()

    expect(result).toEqual({ message: SILENT_MESSAGE })

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

  it('throws sendFailed when the notification service fails', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.countRecentPasswordResetCodes.mockResolvedValue(0)
    notificationService.sendResetCodeByEmail.mockRejectedValue(
      new Error('ses down'),
    )

    await expect(
      service.execute({ email: 'user@test.io' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.sendFailed.errorCode,
    })

    // code was still persisted before the email was attempted
    expect(authRepository.createPasswordResetCode).toHaveBeenCalledTimes(1)
  })
})
