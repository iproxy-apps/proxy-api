import { Module } from '@nestjs/common'

import { RatingsRepository } from './repository/ratings.repository'
import { RateProxyService } from './use-cases/rate-proxy.service'

@Module({
  providers: [RatingsRepository, RateProxyService],
  exports: [RateProxyService],
})
export class RatingsModule {}
