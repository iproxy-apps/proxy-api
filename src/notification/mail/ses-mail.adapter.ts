import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

import { MailPort } from './mail.port'

import type { MailMessage } from './mail.port'

export class SesMailAdapter implements MailPort {
  private ses: SESClient

  constructor(
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    private from: string,
  ) {
    this.ses = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  async send(message: MailMessage): Promise<void> {
    const command = new SendEmailCommand({
      Source: this.from,
      Destination: { ToAddresses: [message.to] },
      Message: {
        Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: message.html, Charset: 'UTF-8' } },
      },
    })

    await this.ses.send(command)
  }
}
