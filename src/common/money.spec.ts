import { Prisma } from '@prisma/client'
import { breakdownToNumbers, computeCharge, toCentavos } from './money'

describe('computeCharge', () => {
  it.each([
    // price,    platformFee, stripeFee, chargedAmount, proxyEarnings, platformNet, chargedCentavos, earningsCentavos
    ['100', '20.00', '4.38', '100.00', '80.00', '15.62', 10000, 8000],
    ['20.03', '4.01', '1.19', '20.03', '16.02', '2.82', 2003, 1602], // platformFee 4.006 → 4.01
    ['20', '4.00', '1.19', '20.00', '16.00', '2.81', 2000, 1600], // MIN_OFFERED_PRICE
    ['50', '10.00', '2.39', '50.00', '40.00', '7.61', 5000, 4000], // stripeFee 2.385 → 2.39 (half-up, not half-even)
    ['49.90', '9.98', '2.38', '49.90', '39.92', '7.60', 4990, 3992],
    ['33.33', '6.67', '1.72', '33.33', '26.66', '4.95', 3333, 2666],
    [
      '1234.56',
      '246.91',
      '49.65',
      '1234.56',
      '987.65',
      '197.26',
      123456,
      98765,
    ],
    [
      '10000',
      '2000.00',
      '399.39',
      '10000.00',
      '8000.00',
      '1600.61',
      1000000,
      800000,
    ], // MAX_OFFERED_PRICE
  ])(
    'price %s',
    (
      price,
      platformFee,
      stripeFee,
      chargedAmount,
      proxyEarnings,
      platformNet,
      chargedCentavos,
      earningsCentavos,
    ) => {
      const b = computeCharge(price)
      expect(b.platformFee.toFixed(2)).toBe(platformFee)
      expect(b.stripeFee.toFixed(2)).toBe(stripeFee)
      expect(b.chargedAmount.toFixed(2)).toBe(chargedAmount)
      expect(b.proxyEarnings.toFixed(2)).toBe(proxyEarnings)
      expect(b.platformNet.toFixed(2)).toBe(platformNet)
      expect(toCentavos(b.chargedAmount)).toBe(chargedCentavos)
      expect(toCentavos(b.proxyEarnings)).toBe(earningsCentavos)
      // D1 identities
      expect(b.chargedAmount.toFixed(2)).toBe(
        new Prisma.Decimal(price).toFixed(2),
      )
      expect(b.proxyEarnings.toFixed(2)).toBe(
        new Prisma.Decimal(price)
          .mul('0.80')
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(2),
      )
      expect(b.platformFee.plus(b.proxyEarnings).toFixed(2)).toBe(chargedAmount)
      expect(
        b.chargedAmount
          .mul('0.0399')
          .plus('0.39')
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(2),
      ).toBe(stripeFee)
      expect(b.platformFee.minus(b.stripeFee).toFixed(2)).toBe(platformNet)
    },
  )
  it('accepts Decimal and number inputs', () => {
    expect(
      computeCharge(new Prisma.Decimal('100')).proxyEarnings.toFixed(2),
    ).toBe('80.00')
    expect(computeCharge(100).stripeFee.toFixed(2)).toBe('4.38')
  })
})

describe('toCentavos', () => {
  it('never produces a float artefact', () => {
    expect(toCentavos(new Prisma.Decimal('20.01'))).toBe(2001) // 20.01 * 100 === 2001.0000000000002 in JS
    expect(Number.isInteger(toCentavos(new Prisma.Decimal('0.29')))).toBe(true) // 0.29 * 100 === 28.999999999999996
  })
})

describe('breakdownToNumbers', () => {
  it('returns the five plain numbers for the HTTP layer (no platformNet)', () => {
    expect(breakdownToNumbers(computeCharge('100'))).toEqual({
      offeredPrice: 100,
      platformFee: 20,
      stripeFee: 4.38,
      chargedAmount: 100,
      proxyEarnings: 80,
    })
  })
})
