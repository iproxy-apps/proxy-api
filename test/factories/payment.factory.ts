import { PrismaService } from 'src/prisma/prisma.service'

type CreatePaymentOverrides = {
  paymentIntent?: string
  status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed'
  amount?: number
  chargeId?: string | null
  refundId?: string | null
  disputeId?: string | null
  createdAt?: Date
}

export const createPayment = (
  prisma: PrismaService,
  taskId: string,
  overrides: CreatePaymentOverrides = {},
) =>
  prisma.payments.create({
    data: {
      taskId,
      paymentIntent: overrides.paymentIntent ?? 'pi_test_123',
      status: overrides.status ?? 'succeeded',
      // = chargedAmount of the task factory default (offeredPrice 50)
      amount: overrides.amount ?? 50,
      chargeId:
        overrides.chargeId === undefined
          ? (overrides.status ?? 'succeeded') === 'succeeded'
            ? 'ch_test_123'
            : null
          : overrides.chargeId,
      refundId: overrides.refundId ?? null,
      disputeId: overrides.disputeId ?? null,
      ...(overrides.createdAt && { createdAt: overrides.createdAt }),
    },
  })
