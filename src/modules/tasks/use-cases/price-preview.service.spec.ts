import { PricePreviewService } from './price-preview.service'

describe('PricePreviewService', () => {
  const service = new PricePreviewService()

  it('returns the D1 breakdown for R$ 100,00', () => {
    expect(service.execute(100)).toEqual({
      offeredPrice: 100,
      platformFee: 20,
      stripeFee: 4.38,
      chargedAmount: 100,
      proxyEarnings: 80,
    })
  })

  it('returns the D1 breakdown for R$ 50,00', () => {
    expect(service.execute(50)).toEqual({
      offeredPrice: 50,
      platformFee: 10,
      stripeFee: 2.39,
      chargedAmount: 50,
      proxyEarnings: 40,
    })
  })
})
