import { Injectable } from '@nestjs/common'

import { hashRefreshToken } from '../utils/refresh-token'
import { RefreshTokensRepository } from '../repository/refresh-tokens.repository'

@Injectable()
export class LogoutService {
  constructor(private refreshTokensRepository: RefreshTokensRepository) {}

  async execute(refreshToken: string): Promise<void> {
    const row = await this.refreshTokensRepository.findByHash(
      hashRefreshToken(refreshToken),
    )
    if (!row) return

    await this.refreshTokensRepository.revokeFamily(row.familyId)
  }
}
