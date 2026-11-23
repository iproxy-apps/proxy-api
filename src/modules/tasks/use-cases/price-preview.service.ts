import { Injectable } from '@nestjs/common'

import { breakdownToNumbers, computeCharge } from 'src/common/money'

import type { PricePreview } from '../types'

@Injectable()
export class PricePreviewService {
  execute(offeredPrice: number): PricePreview {
    return breakdownToNumbers(computeCharge(offeredPrice))
  }
}
