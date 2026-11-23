import { Prisma } from '@prisma/client'

export const PLATFORM_FEE_RATE = new Prisma.Decimal('0.20')
export const STRIPE_FEE_RATE = new Prisma.Decimal('0.0399')
export const STRIPE_FEE_FIXED = new Prisma.Decimal('0.39')
export const MIN_OFFERED_PRICE = 20
export const MAX_OFFERED_PRICE = 10_000

export type ChargeBreakdown = {
  offeredPrice: Prisma.Decimal
  platformFee: Prisma.Decimal
  stripeFee: Prisma.Decimal
  chargedAmount: Prisma.Decimal
  proxyEarnings: Prisma.Decimal
  // bookkeeping only: never persisted, never sent over HTTP
  platformNet: Prisma.Decimal
}

const HALF_UP = Prisma.Decimal.ROUND_HALF_UP

export function computeCharge(
  offeredPrice: Prisma.Decimal | number | string,
): ChargeBreakdown {
  const price = new Prisma.Decimal(offeredPrice)
  // the client pays exactly what they typed
  const chargedAmount = price
  const platformFee = price.mul(PLATFORM_FEE_RATE).toDecimalPlaces(2, HALF_UP)
  const proxyEarnings = price.minus(platformFee)
  const stripeFee = chargedAmount
    .mul(STRIPE_FEE_RATE)
    .plus(STRIPE_FEE_FIXED)
    .toDecimalPlaces(2, HALF_UP)
  const platformNet = platformFee.minus(stripeFee)
  return {
    offeredPrice: price,
    platformFee,
    stripeFee,
    chargedAmount,
    proxyEarnings,
    platformNet,
  }
}

export function toCentavos(value: Prisma.Decimal): number {
  return value.mul(100).toDecimalPlaces(0, HALF_UP).toNumber()
}

export function breakdownToNumbers(b: ChargeBreakdown): {
  offeredPrice: number
  platformFee: number
  stripeFee: number
  chargedAmount: number
  proxyEarnings: number
} {
  return {
    offeredPrice: b.offeredPrice.toNumber(),
    platformFee: b.platformFee.toNumber(),
    stripeFee: b.stripeFee.toNumber(),
    chargedAmount: b.chargedAmount.toNumber(),
    proxyEarnings: b.proxyEarnings.toNumber(),
  }
}
