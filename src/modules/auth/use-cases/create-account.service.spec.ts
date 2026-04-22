import { compare } from 'bcryptjs'

import { makeUser } from '../test-utils/user.factory'
import { StripeService } from 'src/stripe/stripe.service'
import { AuthenticateService } from './authenticate.service'
import { AuthRepository } from '../repository/auth.repository'
import { CreateAccountService } from './create-account.service'
import { errorDictionary } from 'src/exception/error-dictionary'

import type { Prisma } from '@prisma/client'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'findByEmail' | 'create'>
>

type StripeServiceMock = jest.Mocked<
  Pick<StripeService, 'searchCustomer' | 'createCustomer'>
>

type AuthenticateServiceMock = jest.Mocked<Pick<AuthenticateService, 'execute'>>

const makeCreateInput = (
  overrides: Partial<Prisma.UsersCreateInput> = {},
): Prisma.UsersCreateInput => ({
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
    }
    stripeService = {
      searchCustomer: jest.fn(),
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

    expect(stripeService.searchCustomer).not.toHaveBeenCalled()
    expect(authRepository.create).not.toHaveBeenCalled()
    expect(authenticateService.execute).not.toHaveBeenCalled()
  })

  it('reuses the existing Stripe customer when one is found', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    stripeService.searchCustomer.mockResolvedValue({
      data: [{ id: 'cus_existing' }],
    } as Awaited<ReturnType<StripeService['searchCustomer']>>)
    authenticateService.execute.mockResolvedValue({ session: 'token' })

    await service.execute(makeCreateInput({ email: 'reuse@test.io' }))

    expect(stripeService.searchCustomer).toHaveBeenCalledWith('reuse@test.io')
    expect(stripeService.createCustomer).not.toHaveBeenCalled()
    expect(authRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: 'cus_existing' }),
    )
  })

  it('creates a new Stripe customer when the search returns empty', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    stripeService.searchCustomer.mockResolvedValue({
      data: [],
    } as unknown as Awaited<ReturnType<StripeService['searchCustomer']>>)
    stripeService.createCustomer.mockResolvedValue({
      id: 'cus_new',
    } as Awaited<ReturnType<StripeService['createCustomer']>>)
    authenticateService.execute.mockResolvedValue({ session: 'token' })

    await service.execute(
      makeCreateInput({ email: 'new@test.io', name: 'New User' }),
    )

    expect(stripeService.createCustomer).toHaveBeenCalledWith(
      'new@test.io',
      'New User',
    )
    expect(authRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: 'cus_new' }),
    )
  })

  it('throws standard error when Stripe fails', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    stripeService.searchCustomer.mockRejectedValue(new Error('stripe down'))

    await expect(service.execute(makeCreateInput())).rejects.toMatchObject({
      errorCode: errorDictionary.standard.errorCode,
    })

    expect(authRepository.create).not.toHaveBeenCalled()
    expect(authenticateService.execute).not.toHaveBeenCalled()
  })

  it('hashes the password before persisting and delegates login to authenticate', async () => {
    authRepository.findByEmail.mockResolvedValue(null)
    stripeService.searchCustomer.mockResolvedValue({
      data: [{ id: 'cus_x' }],
    } as Awaited<ReturnType<StripeService['searchCustomer']>>)
    authenticateService.execute.mockResolvedValue({ session: 'session-token' })

    const input = makeCreateInput({
      email: 'hash@test.io',
      password: 'plaintext-password',
    })

    const result = await service.execute(input)

    const createArgs = authRepository.create.mock.calls[0][0]
    expect(createArgs.password).not.toBe('plaintext-password')
    await expect(
      compare('plaintext-password', createArgs.password as string),
    ).resolves.toBe(true)

    expect(authenticateService.execute).toHaveBeenCalledWith({
      email: 'hash@test.io',
      password: 'plaintext-password',
    })
    expect(result).toEqual({ session: 'session-token' })
  })
})
