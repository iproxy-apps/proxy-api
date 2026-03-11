export type CreateUserSourceData = {
  userId: string
  token?: string
  brand?: string
  last4?: string
  savedCard?: string
}

export type FetchUserCardData = {
  userId: string
}

export type UserCard = {
  id: string
  userId: string
  brand: string
  last4: string
  stripeCardId: string
}

export type UpdateUserSourceData = {
  id: string
  brand: string
  last4: string
  stripeCardId: string
}
