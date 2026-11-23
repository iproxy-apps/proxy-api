import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type {
  PaymentRecord,
  UpdatePaymentData,
  RecordSucceededChargeData,
} from '../types'
import type { PaymentsRepositoryDTO } from '../dtos/payments-repository.dto'

@Injectable()
export class PaymentsRepository implements PaymentsRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async fetchLatestByTaskId(taskId: string): Promise<PaymentRecord | null> {
    return await this.prisma.payments.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findByPaymentIntent(
    paymentIntent: string,
  ): Promise<PaymentRecord | null> {
    return await this.prisma.payments.findUnique({ where: { paymentIntent } })
  }

  async updateById(id: string, data: UpdatePaymentData): Promise<void> {
    await this.prisma.payments.update({ where: { id }, data })
  }

  async recordSucceededCharge(
    data: RecordSucceededChargeData,
  ): Promise<PaymentRecord> {
    const { taskId, paymentIntent, amount, chargeId } = data
    await this.prisma.payments.createMany({
      data: [{ taskId, paymentIntent, amount, status: 'succeeded', chargeId }],
      skipDuplicates: true,
    })
    await this.prisma.payments.updateMany({
      where: { paymentIntent, status: 'pending' },
      data: { status: 'succeeded' },
    })
    if (chargeId !== null) {
      await this.prisma.payments.updateMany({
        where: { paymentIntent, chargeId: null },
        data: { chargeId },
      })
    }
    return await this.prisma.payments.findUniqueOrThrow({
      where: { paymentIntent },
    })
  }
}
