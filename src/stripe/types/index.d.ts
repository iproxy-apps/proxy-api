export type CreateMerchantAccountData = {
  email: string
  lastName: string
  firstName: string
  phoneNumber: string
}

export type LinkMerchantAccountData = {
  url: string
  account: string
}

export type ChargeSavedCardData = {
  amount: number // centavos, from toCentavos(chargedAmount)
  customer: string
  paymentMethod: string
  taskId: string
  proxyId: string
  claimedAt: string // ISO of the claim's Tasks.startedAt; lets a webhook be matched to the exact claim
}

export type CreateTransferData = {
  amount: number
  destination: string
  sourceTransaction: string
  transferGroup: string
  taskId: string
}
