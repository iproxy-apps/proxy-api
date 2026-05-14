import { Module } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'
import { RatingsRepository } from './repository/ratings.repository'
import { RateProxyService } from './use-cases/rate-proxy.service'

@Module({
  providers: [PrismaService, RatingsRepository, RateProxyService],
  exports: [RateProxyService],
})
export class RatingsModule {}
