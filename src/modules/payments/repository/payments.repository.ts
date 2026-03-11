import { Injectable } from '@nestjs/common'

import { PrismaService } from 'src/prisma/prisma.service'

import type { CreatePaymentRecordData, PaymentRecord } from '../types'
import type { PaymentsRepositoryDTO } from '../dtos/payments-repository.dto'

@Injectable()
export class PaymentsRepository implements PaymentsRepositoryDTO {
  constructor(private prisma: PrismaService) {}

  async createPaymentRecord(data: CreatePaymentRecordData): Promise<void> {
    await this.prisma.payments.create({ data })
  }

  async fetchPaymentRecord(taskId: string): Promise<PaymentRecord | null> {
    return await this.prisma.payments.findFirst({ where: { taskId } })
  }

  async updatePaymentRecord(
    taskId: string,
    data: Partial<PaymentRecord>,
  ): Promise<void> {
    await this.prisma.payments.updateMany({
      where: { taskId },
      data,
    })
  }
}
