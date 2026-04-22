import { PaymentsRepository } from '../repository/payments.repository'
import { FetchPaymentRecordService } from './fetch-payment-record.service'

import type { PaymentRecord } from '../types'

type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'fetchPaymentRecord'>
>

describe('FetchPaymentRecordService', () => {
  let service: FetchPaymentRecordService
  let paymentsRepository: PaymentsRepositoryMock

  beforeEach(() => {
    paymentsRepository = { fetchPaymentRecord: jest.fn() }

    service = new FetchPaymentRecordService(
      paymentsRepository as unknown as PaymentsRepository,
    )
  })

  it('returns null when no payment record exists for the task', async () => {
    paymentsRepository.fetchPaymentRecord.mockResolvedValue(null)

    const result = await service.execute('task-1')

    expect(paymentsRepository.fetchPaymentRecord).toHaveBeenCalledWith('task-1')
    expect(result).toBeNull()
  })

  it('returns the payment record from the repository', async () => {
    const record = {
      amount: 50,
      id: 'pay-1',
      refundId: null,
      taskId: 'task-1',
      paymentIntent: 'pi_123',
    } as unknown as PaymentRecord
    paymentsRepository.fetchPaymentRecord.mockResolvedValue(record)

    const result = await service.execute('task-1')

    expect(result).toBe(record)
  })
})
