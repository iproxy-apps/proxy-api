import { Prisma } from '@prisma/client'

import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { UpdateWalletBalanceService } from './update-wallet-balance.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById' | 'updateWalletBalance'>
>

describe('UpdateWalletBalanceService', () => {
  let service: UpdateWalletBalanceService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    authRepository = {
      updateWalletBalance: jest.fn(),
      fetchUserDetailsById: jest.fn(),
    }

    service = new UpdateWalletBalanceService(
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when the user does not exist', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(
      service.execute({ userId: 'missing-user', amount: 50 }),
    ).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.updateWalletBalance).not.toHaveBeenCalled()
  })

  it('adds the amount to the current wallet balance', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({ walletBalance: new Prisma.Decimal(50) }),
    )

    await service.execute({ userId: 'user-1', amount: 20 })

    expect(authRepository.updateWalletBalance).toHaveBeenCalledWith(
      'user-1',
      70,
    )
  })

  it('supports negative amounts (debits)', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({ walletBalance: new Prisma.Decimal(100) }),
    )

    await service.execute({ userId: 'user-1', amount: -30 })

    expect(authRepository.updateWalletBalance).toHaveBeenCalledWith(
      'user-1',
      70,
    )
  })

  it('falls back to 0 when the current balance is missing', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(
      makeUser({
        walletBalance: null as unknown as Prisma.Decimal,
      }),
    )

    await service.execute({ userId: 'user-1', amount: 15 })

    expect(authRepository.updateWalletBalance).toHaveBeenCalledWith(
      'user-1',
      15,
    )
  })
})
