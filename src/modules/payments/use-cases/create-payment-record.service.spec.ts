import { PaymentsRepository } from '../repository/payments.repository'
import { CreatePaymentRecordService } from './create-payment-record.service'

type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'createPaymentRecord'>
>

describe('CreatePaymentRecordService', () => {
  let service: CreatePaymentRecordService
  let paymentsRepository: PaymentsRepositoryMock

  beforeEach(() => {
    paymentsRepository = { createPaymentRecord: jest.fn() }

    service = new CreatePaymentRecordService(
      paymentsRepository as unknown as PaymentsRepository,
    )
  })

  it('forwards the payload to the repository', async () => {
    const payload = {
      amount: 50,
      taskId: 'task-1',
      paymentIntent: 'pi_123',
    }

    await service.execute(payload)

    expect(paymentsRepository.createPaymentRecord).toHaveBeenCalledWith(payload)
  })
})
