import { compare, hash } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { ResetPasswordService } from './reset-password.service'
import { errorDictionary } from 'src/exception/error-dictionary'

type AuthRepositoryMock = jest.Mocked<
  Pick<
    AuthRepository,
    | 'findByEmail'
    | 'updateUserPassword'
    | 'findValidPasswordResetCode'
    | 'markPasswordResetCodeAsUsed'
  >
>

type StoredResetCode = Awaited<
  ReturnType<AuthRepository['findValidPasswordResetCode']>
>

const makeStoredCode = async (
  plaintext: string,
): Promise<NonNullable<StoredResetCode>> => ({
  used: false,
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
      updateUserPassword: jest.fn(),
      findValidPasswordResetCode: jest.fn(),
      markPasswordResetCodeAsUsed: jest.fn(),
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

    expect(authRepository.findValidPasswordResetCode).not.toHaveBeenCalled()
    expect(authRepository.updateUserPassword).not.toHaveBeenCalled()
    expect(authRepository.markPasswordResetCodeAsUsed).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when there is no valid reset code', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findValidPasswordResetCode.mockResolvedValue(null)

    await expect(
      service.execute({
        code: '123456',
        email: 'user@test.io',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.updateUserPassword).not.toHaveBeenCalled()
    expect(authRepository.markPasswordResetCodeAsUsed).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when the provided code does not match', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findValidPasswordResetCode.mockResolvedValue(
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

    expect(authRepository.updateUserPassword).not.toHaveBeenCalled()
    expect(authRepository.markPasswordResetCodeAsUsed).not.toHaveBeenCalled()
  })

  it('updates password, marks code as used, and returns success when code is valid', async () => {
    const user = makeUser()
    const storedCode = await makeStoredCode('654321')
    authRepository.findByEmail.mockResolvedValue(user)
    authRepository.findValidPasswordResetCode.mockResolvedValue(storedCode)

    const result = await service.execute({
      code: '654321',
      email: 'user@test.io',
      newPassword: 'my-new-password',
    })

    expect(result).toEqual({ message: 'Senha redefinida com sucesso.' })

    expect(authRepository.updateUserPassword).toHaveBeenCalledTimes(1)
    const [userIdArg, hashedPassword] =
      authRepository.updateUserPassword.mock.calls[0]
    expect(userIdArg).toBe(user.id)
    expect(hashedPassword).not.toBe('my-new-password')
    await expect(
      compare('my-new-password', hashedPassword as string),
    ).resolves.toBe(true)

    expect(authRepository.markPasswordResetCodeAsUsed).toHaveBeenCalledWith(
      storedCode.id,
    )
  })
})
