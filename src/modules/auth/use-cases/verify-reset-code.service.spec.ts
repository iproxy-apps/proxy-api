import { hash } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { VerifyResetCodeService } from './verify-reset-code.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<
    AuthRepository,
    | 'findByEmail'
    | 'findPendingResetCode'
    | 'markPasswordResetCodeAsVerified'
    | 'reservePasswordResetAttempt'
  >
>

type StoredResetCode = Awaited<
  ReturnType<AuthRepository['findPendingResetCode']>
>

const makeStoredCode = async (
  plaintext: string,
): Promise<NonNullable<StoredResetCode>> => ({
  state: 'pending',
  attempts: 0,
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
      findPendingResetCode: jest.fn(),
      markPasswordResetCodeAsVerified: jest.fn().mockResolvedValue(true),
      reservePasswordResetAttempt: jest.fn().mockResolvedValue(true),
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

    expect(authRepository.findPendingResetCode).not.toHaveBeenCalled()
    expect(
      authRepository.markPasswordResetCodeAsVerified,
    ).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when no verifiable reset code exists', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findPendingResetCode.mockResolvedValue(null)

    await expect(
      service.execute({ email: 'user@test.io', code: '123456' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(
      authRepository.markPasswordResetCodeAsVerified,
    ).not.toHaveBeenCalled()
  })

  it('throws invalidOrExpiredCode when the provided code does not match', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    const storedCode = await makeStoredCode('123456')
    authRepository.findPendingResetCode.mockResolvedValue(storedCode)

    await expect(
      service.execute({ email: 'user@test.io', code: '999999' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(authRepository.reservePasswordResetAttempt).toHaveBeenCalledWith(
      storedCode.id,
      'pending',
    )

    expect(
      authRepository.markPasswordResetCodeAsVerified,
    ).not.toHaveBeenCalled()
  })

  it('marks the code as verified and returns success when the code matches', async () => {
    const storedCode = await makeStoredCode('654321')
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findPendingResetCode.mockResolvedValue(storedCode)

    const result = await service.execute({
      email: 'user@test.io',
      code: '654321',
    })

    expect(result).toEqual({ message: 'Código verificado com sucesso.' })
    expect(authRepository.markPasswordResetCodeAsVerified).toHaveBeenCalledWith(
      storedCode.id,
    )
  })

  it('throws invalidOrExpiredCode without comparing when the attempt cap is exhausted', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())
    authRepository.findPendingResetCode.mockResolvedValue(
      await makeStoredCode('654321'),
    )
    authRepository.reservePasswordResetAttempt.mockResolvedValue(false)

    await expect(
      service.execute({ email: 'user@test.io', code: '654321' }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.passwordReset.invalidOrExpiredCode.errorCode,
    })

    expect(
      authRepository.markPasswordResetCodeAsVerified,
    ).not.toHaveBeenCalled()
  })
})
