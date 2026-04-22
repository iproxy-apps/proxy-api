import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class StripeEventsRepository {
  constructor(private prisma: PrismaService) {}

  async wasProcessed(eventId: string): Promise<boolean> {
    const event = await this.prisma.stripeEvents.findUnique({
      where: { id: eventId },
    })
    return event !== null
  }

  async markAsProcessed(eventId: string, type: string): Promise<void> {
    await this.prisma.stripeEvents.create({
      data: { id: eventId, type },
    })
  }
}
