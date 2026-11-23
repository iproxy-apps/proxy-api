import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  UserCard,
  CreateUserSourceData,
  ReplaceUserCardData,
} from '../types'
import type { CardsRepositoryDTO } from '../dtos/cards-repository.dto'

@Injectable()
export class CardsRepository implements CardsRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async createUserSource(data: CreateUserSourceData): Promise<UserCard> {
    const { token, userId, brand, last4 } = data
    return await this.prisma.cards.create({
      data: {
        userId: userId,
        brand: brand as string,
        last4: last4 as string,
        stripeCardId: token as string,
      },
    })
  }

  async fetchUserCard(userId: string): Promise<UserCard | null> {
    return await this.prisma.cards.findFirst({
      where: { userId: userId, isDeleted: false },
    })
  }

  async fetchCardById(id: string): Promise<UserCard | null> {
    return await this.prisma.cards.findFirst({
      where: { id, isDeleted: false },
    })
  }

  async replaceUserCard(
    data: ReplaceUserCardData,
  ): Promise<{ card: UserCard; previousStripeCardId: string | null }> {
    const { userId, stripeCardId, brand, last4 } = data

    return await this.prisma.$transaction(async (tx) => {
      const previous = await tx.cards.findFirst({
        where: { userId, isDeleted: false },
      })

      if (previous) {
        await tx.cards.update({
          where: { id: previous.id },
          data: { isDeleted: true },
        })
      }

      const card = await tx.cards.create({
        data: { userId, stripeCardId, brand, last4 },
      })

      await tx.users.update({
        where: { id: userId },
        data: { cardActionRequired: false },
      })

      return { card, previousStripeCardId: previous?.stripeCardId ?? null }
    })
  }

  async softDeleteCard(id: string): Promise<void> {
    await this.prisma.cards.update({
      where: { id },
      data: { isDeleted: true },
    })
  }
}
