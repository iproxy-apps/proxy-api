import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  UserCard,
  CreateUserSourceData,
  UpdateUserSourceData,
} from '../types'
import type { CardsRepositoryDTO } from '../dtos/cards-repository.dto'

@Injectable()
export class CardsRepository implements CardsRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async createUserSource(data: CreateUserSourceData): Promise<void> {
    const { token, userId, brand, last4 } = data
    await this.prisma.cards.create({
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

  async updateUserSource(data: UpdateUserSourceData): Promise<void> {
    const { id, brand, last4, stripeCardId } = data
    await this.prisma.cards.update({
      where: { id },
      data: {
        brand,
        last4,
        stripeCardId,
      },
    })
  }

  async softDeleteCard(id: string): Promise<void> {
    await this.prisma.cards.update({
      where: { id },
      data: { isDeleted: true },
    })
  }
}
