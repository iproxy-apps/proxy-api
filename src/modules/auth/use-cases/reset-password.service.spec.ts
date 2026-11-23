import { compare, hash } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import {
  AuthRepository,
  ResetCodeNotUsableError,
} from '../repository/auth.repository'
import { ResetPasswordService } from './reset-password.service'
import { errorDictionary } from 'src/exception/error-dictionary'

type AuthRepositoryMock = jest.Mocked<
  Pick<
    AuthRepository,
    | 'findByEmail'
    | 'findVerifiedResetCode'
    | 'resetPasswordWithCode'
    | 'reservePasswordResetAttempt'
  >
>

type StoredResetCode = Awaited<
  ReturnType<AuthRepository['findVerifiedResetCode']>
>

const makeStoredCode = async (
  plaintext: string,
): Promise<NonNullable<StoredResetCode>> => ({
  state: 'verified',
  attempts: 0,
  id: 'reset-1',
  userId: 'user-1',
  createdAt: new Date(),
  code: await hash(plaintext, 8),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
})

describe('ResetPasswordService', () => {
  let service: ResetPasswordService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    authRepository = {
      findByEmail: jest.fn(),
      findVerifiedResetCode: jest.fn(),
      resetPasswordWithCode: jest.fn(),
      reservePasswordResetAttempt: jest.fn().mockResolvedValue(true),
    }

    service = new ResetPasswordService(
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws invalidOrExpiredCode when the user does not exist', async () => {
    authRepository.findByEmail.mockResolvedValue(null)

    await expect(
      service.execute({
        code: '123456',
        email: 'missing@test.io',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.findVerifiedResetCode).not.toHaveBeenCalled()
    expect(authRepository.resetPasswordWithCode).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when there is no verified reset code', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findVerifiedResetCode.mockResolvedValue(null)

    await expect(
      service.execute({
        code: '123456',
        email: 'user@test.io',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.resetPasswordWithCode).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when the provided code does not match', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findVerifiedResetCode.mockResolvedValue(
      await makeStoredCode('123456'),
    )

    await expect(
      service.execute({
        code: '999999',
        email: 'user@test.io',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.resetPasswordWithCode).not.toHaveBeenCalled()
  })

  it('atomically updates password and marks the code used when valid', async () => {
    const user = makeUser()
    const storedCode = await makeStoredCode('654321')
    authRepository.findByEmail.mockResolvedValue(user)
    authRepository.findVerifiedResetCode.mockResolvedValue(storedCode)

    const result = await service.execute({
      code: '654321',
      email: 'user@test.io',
      newPassword: 'my-new-password',
    })

    expect(result).toEqual({ message: 'Senha redefinida com sucesso.' })

    expect(authRepository.resetPasswordWithCode).toHaveBeenCalledTimes(1)
    const [userIdArg, hashedPassword, codeIdArg] =
      authRepository.resetPasswordWithCode.mock.calls[0]
    expect(userIdArg).toBe(user.id)
    expect(codeIdArg).toBe(storedCode.id)
    expect(hashedPassword).not.toBe('my-new-password')
    await expect(
      compare('my-new-password', hashedPassword as string),
    ).resolves.toBe(true)
  })

  it('throws invalidOrExpiredCode when the attempt cap is exhausted', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findVerifiedResetCode.mockResolvedValue(
      await makeStoredCode('654321'),
    )
    authRepository.reservePasswordResetAttempt.mockResolvedValue(false)

    await expect(
      service.execute({
        code: '654321',
        email: 'user@test.io',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.resetPasswordWithCode).not.toHaveBeenCalled()
  })

  it('maps a concurrently consumed code to invalidOrExpiredCode', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findVerifiedResetCode.mockResolvedValue(
      await makeStoredCode('654321'),
    )
    authRepository.resetPasswordWithCode.mockRejectedValue(
      new ResetCodeNotUsableError(),
    )

    await expect(
      service.execute({
        code: '654321',
        email: 'user@test.io',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })
  })
})
