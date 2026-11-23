import { NotificationService } from './notification.service'

describe('NotificationService', () => {
  it('sendResetCodeByEmail delegates to the MailPort with the escaped name', async () => {
    const mail = { send: jest.fn().mockResolvedValue(undefined) }

    await new NotificationService(mail).sendResetCodeByEmail(
      'a@b.io',
      '123456',
      '<Ana>',
    )

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@b.io',
        html: expect.stringContaining('&lt;Ana&gt;'),
      }),
    )
  })

  it('sendCardChargeFailedEmail delegates to the MailPort with escaped fields', async () => {
    const mail = { send: jest.fn().mockResolvedValue(undefined) }

    await new NotificationService(mail).sendCardChargeFailedEmail(
      'a@b.io',
      '<Ana>',
      '<b>Tarefa</b>',
    )

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@b.io',
        subject: 'Confirme seu cartão na Carteira - Proxy',
        html: expect.stringContaining('&lt;b&gt;Tarefa&lt;/b&gt;'),
      }),
    )
  })
})
