import { RateProxyService } from './rate-proxy.service'
import { RatingsRepository } from '../repository/ratings.repository'

type RatingsRepositoryMock = jest.Mocked<
  Pick<
    RatingsRepository,
    'createRating' | 'averageScoreForUser' | 'setUserRating'
  >
>

describe('RateProxyService', () => {
  let service: RateProxyService
  let ratingsRepository: RatingsRepositoryMock

  beforeEach(() => {
    ratingsRepository = {
      createRating: jest.fn(),
      averageScoreForUser: jest.fn().mockResolvedValue(0),
      setUserRating: jest.fn(),
    }

    service = new RateProxyService(
      ratingsRepository as unknown as RatingsRepository,
    )
  })

  it('persists the rating row with the given fields', async () => {
    await service.execute({
      taskId: 'task-1',
      raterId: 'client-1',
      ratedId: 'proxy-1',
      score: 5,
      comment: 'ótimo',
    })

    expect(ratingsRepository.createRating).toHaveBeenCalledWith({
      taskId: 'task-1',
      raterId: 'client-1',
      ratedId: 'proxy-1',
      score: 5,
      comment: 'ótimo',
    })
  })

  it('recomputes and writes the rated user average', async () => {
    ratingsRepository.averageScoreForUser.mockResolvedValue(4.5)

    await service.execute({
      taskId: 'task-1',
      raterId: 'client-1',
      ratedId: 'proxy-1',
      score: 4,
    })

    expect(ratingsRepository.averageScoreForUser).toHaveBeenCalledWith('proxy-1')
    expect(ratingsRepository.setUserRating).toHaveBeenCalledWith('proxy-1', 4.5)
  })
})
