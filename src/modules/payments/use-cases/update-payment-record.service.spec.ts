import { PaymentsRepository } from '../repository/payments.repository'
import { UpdatePaymentRecordService } from './update-payment-record.service'

type PaymentsRepositoryMock = jest.Mocked<
  Pick<PaymentsRepository, 'updatePaymentRecord'>
>

describe('UpdatePaymentRecordService', () => {
  let service: UpdatePaymentRecordService
  let paymentsRepository: PaymentsRepositoryMock

  beforeEach(() => {
    paymentsRepository = { updatePaymentRecord: jest.fn() }

    service = new UpdatePaymentRecordService(
      paymentsRepository as unknown as PaymentsRepository,
    )
  })

  it('forwards the taskId and partial payload to the repository', async () => {
    const patch = { refundId: 're_123' }

    await service.execute('task-1', patch)

    expect(paymentsRepository.updatePaymentRecord).toHaveBeenCalledWith(
      'task-1',
      patch,
    )
  })
})
