import { hash } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { VerifyResetCodeService } from './verify-reset-code.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'findByEmail' | 'findValidPasswordResetCode'>
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

describe('VerifyResetCodeService', () => {
  let service: VerifyResetCodeService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    authRepository = {
      findByEmail: jest.fn(),
      findValidPasswordResetCode: jest.fn(),
    }

    service = new VerifyResetCodeService(
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws invalidOrExpiredCode when the user does not exist', async () => {
    authRepository.findByEmail.mockResolvedValue(null)

    await expect(
      service.execute({ email: 'missing@test.io', code: '123456' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.findValidPasswordResetCode).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when no valid reset code exists', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findValidPasswordResetCode.mockResolvedValue(null)

    await expect(
      service.execute({ email: 'user@test.io', code: '123456' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })
  })

  it('throws invalidOrExpiredCode when the provided code does not match', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findValidPasswordResetCode.mockResolvedValue(
      await makeStoredCode('123456'),
    )

    await expect(
      service.execute({ email: 'user@test.io', code: '999999' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })
  })

  it('returns the success message when the code matches', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findValidPasswordResetCode.mockResolvedValue(
      await makeStoredCode('654321'),
    )

    const result = await service.execute({
      email: 'user@test.io',
      code: '654321',
    })

    expect(result).toEqual({ message: 'Código verificado com sucesso.' })
  })
})
