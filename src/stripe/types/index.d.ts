export type CreatePaymentIntentData = {
  amount: number
  customer: string
  savedCard: string
}

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
