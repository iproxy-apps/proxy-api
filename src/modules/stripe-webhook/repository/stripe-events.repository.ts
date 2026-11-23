import { Prisma } from '@prisma/client'
import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class StripeEventsRepository {
  constructor(private prisma: PrismaService) {}

  /** Claims the event id; false when another delivery already holds it. */
  async tryMarkProcessed(eventId: string, type: string): Promise<boolean> {
    try {
      await this.prisma.stripeEvents.create({ data: { id: eventId, type } })
      return true
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false
      }
      throw error
    }
  }

  async remove(eventId: string): Promise<void> {
    await this.prisma.stripeEvents.deleteMany({ where: { id: eventId } })
  }
}
