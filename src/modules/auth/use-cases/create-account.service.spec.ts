import { compare } from 'bcryptjs'
import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { makeUser } from '../test-utils/user.factory'
import { StripeService } from 'src/stripe/stripe.service'
import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { CreateAccountService } from './create-account.service'
import { errorDictionary } from 'src/exception/error-dictionary'

import type { CreateAccountInput } from '../types'

type AuthRepositoryMock = jest.Mocked<
  Pick<
    AuthRepository,
    'findByEmail' | 'create' | 'updateStripeCustomerId' | 'hardDeleteUser'
  >
>

type StripeServiceMock = jest.Mocked<Pick<StripeService, 'createCustomer'>>

type AuthenticateServiceMock = jest.Mocked<Pick<AuthenticateService, 'execute'>>

const makeCreateInput = (
  overrides: Partial<CreateAccountInput> = {},
): CreateAccountInput => ({
  name: 'New User',
  userType: 'CLIENT',
  termsAccepted: true,
  email: 'new@test.io',
  password: 'plaintext-password',
  ...overrides,
})

describe('CreateAccountService', () => {
  let service: CreateAccountService
  let stripeService: StripeServiceMock
  let authRepository: AuthRepositoryMock
  let authenticateService: AuthenticateServiceMock

  beforeEach(() => {
    authRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      updateStripeCustomerId: jest.fn(),
      hardDeleteUser: jest.fn(),
    }
    stripeService = {
      createCustomer: jest.fn(),
    }
    authenticateService = { execute: jest.fn() }

    service = new CreateAccountService(
      stripeService as unknown as StripeService,
      authRepository as unknown as AuthRepository,
      authenticateService as unknown as AuthenticateService,
    )
  })

  it('throws emailExists when a user with the email already exists', async () => {
    authRepository.findByEmail.mockResolvedValue(makeUser())

    await expect(service.execute(makeCreateInput())).rejects.toMatchObject({
      errorCode: errorDictionary.user.emailExists('any').errorCode,
    })

    expect(stripeService.createCustomer).not.toHaveBeenCalled()
    expect(authRepository.create).not.toHaveBeenCalled()
    expect(authenticateService.execute).not.toHaveBeenCalled()
  })

  it('creates the row first, then the Stripe customer with the user id', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    authRepository.create.mockResolvedValue({ id: 'user-1' })
    stripeService.createCustomer.mockResolvedValue({
      id: 'cus_new',
    } as Awaited<ReturnType<StripeService['createCustomer']>>)
    authenticateService.execute.mockResolvedValue({
      session: 'token',
      refreshToken: 'refresh',
    })

    await service.execute(
      makeCreateInput({ email: 'new@test.io', name: 'New User' }),
    )

    expect(stripeService.createCustomer).toHaveBeenCalledWith(
      'new@test.io',
      'New User',
      'user-1',
    )
    expect(authRepository.updateStripeCustomerId).toHaveBeenCalledWith(
      'user-1',
      'cus_new',
    )
    expect(authRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
      stripeService.createCustomer.mock.invocationCallOrder[0],
    )
  })

  it('maps a P2002 on insert to emailExists without calling Stripe', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    authRepository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    await expect(service.execute(makeCreateInput())).rejects.toMatchObject({
      errorCode: errorDictionary.user.emailExists('any').errorCode,
    })

    expect(stripeService.createCustomer).not.toHaveBeenCalled()
  })

  it('rolls the row back and throws signUpUnavailable when Stripe fails', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    authRepository.create.mockResolvedValue({ id: 'user-2' })
    stripeService.createCustomer.mockRejectedValue(new Error('stripe down'))

    await expect(service.execute(makeCreateInput())).rejects.toMatchObject({
      errorCode: errorDictionary.user.signUpUnavailable.errorCode,
    })

    expect(authRepository.hardDeleteUser).toHaveBeenCalledWith('user-2')
    expect(authRepository.updateStripeCustomerId).not.toHaveBeenCalled()
    expect(authenticateService.execute).not.toHaveBeenCalled()
  })

  it('still throws signUpUnavailable when the rollback itself fails', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
    authRepository.findByEmail.mockResolvedValue(null)
    authRepository.create.mockResolvedValue({ id: 'user-4' })
    stripeService.createCustomer.mockRejectedValue(new Error('stripe down'))
    authRepository.hardDeleteUser.mockRejectedValue(new Error('db down'))

    await expect(service.execute(makeCreateInput())).rejects.toMatchObject({
      errorCode: errorDictionary.user.signUpUnavailable.errorCode,
    })

    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(logSpy.mock.calls[1][0]).toContain('Rollback failed for user user-4')
    logSpy.mockRestore()
  })

  it('rolls back and logs the customer id when saving it fails', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
    authRepository.findByEmail.mockResolvedValue(null)
    authRepository.create.mockResolvedValue({ id: 'user-5' })
    stripeService.createCustomer.mockResolvedValue({
      id: 'cus_orphan',
    } as Awaited<ReturnType<StripeService['createCustomer']>>)
    authRepository.updateStripeCustomerId.mockRejectedValue(new Error('db'))

    await expect(service.execute(makeCreateInput())).rejects.toMatchObject({
      errorCode: errorDictionary.user.signUpUnavailable.errorCode,
    })

    expect(authRepository.hardDeleteUser).toHaveBeenCalledWith('user-5')
    expect(logSpy.mock.calls[0][0]).toContain('cus_orphan')
    logSpy.mockRestore()
  })

  it('hashes the password before persisting and delegates login to authenticate', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    authRepository.create.mockResolvedValue({ id: 'user-3' })
    stripeService.createCustomer.mockResolvedValue({
      id: 'cus_x',
    } as Awaited<ReturnType<StripeService['createCustomer']>>)
    authenticateService.execute.mockResolvedValue({
      session: 'session-token',
      refreshToken: 'refresh-token',
    })

    const input = makeCreateInput({
      email: 'hash@test.io',
      password: 'plaintext-password',
    })

    const result = await service.execute(input)

    const createArgs = authRepository.create.mock.calls[0][0]
    expect(createArgs.password).not.toBe('plaintext-password')
    expect(createArgs.password).toMatch(/^\$2[aby]\$10\$/)
    await expect(
      compare('plaintext-password', createArgs.password as string),
    ).resolves.toBe(true)

    expect(authenticateService.execute).toHaveBeenCalledWith({
      email: 'hash@test.io',
      password: 'plaintext-password',
    })
    expect(result).toEqual({
      session: 'session-token',
      refreshToken: 'refresh-token',
    })
  })
})
