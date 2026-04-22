import { makeUser } from '../test-utils/user.factory'
import { AuthRepository } from '../repository/auth.repository'
import { errorDictionary } from 'src/exception/error-dictionary'
import { FetchUserDetailsService } from './fetch-user-details.service'

type AuthRepositoryMock = jest.Mocked<
  Pick<AuthRepository, 'fetchUserDetailsById'>
>

describe('FetchUserDetailsService', () => {
  let service: FetchUserDetailsService
  let authRepository: AuthRepositoryMock

  beforeEach(() => {
    authRepository = { fetchUserDetailsById: jest.fn() }

    service = new FetchUserDetailsService(
      authRepository as unknown as AuthRepository,
    )
  })

  it('throws notFound when the repository returns null', async () => {
    authRepository.fetchUserDetailsById.mockResolvedValue(null)

    await expect(service.execute('missing-user')).rejects.toMatchObject({
      errorCode: errorDictionary.user.notFound.errorCode,
    })

    expect(authRepository.fetchUserDetailsById).toHaveBeenCalledWith(
      'missing-user',
    )
  })

  it('returns the user details when found', async () => {
    const user = makeUser()
    authRepository.fetchUserDetailsById.mockResolvedValue(user)

    const result = await service.execute('user-1')

    expect(authRepository.fetchUserDetailsById).toHaveBeenCalledWith('user-1')
    expect(result).toBe(user)
  })
})
