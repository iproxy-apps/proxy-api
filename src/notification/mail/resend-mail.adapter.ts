import { MailPort } from './mail.port'

import type { MailMessage } from './mail.port'

export class ResendMailAdapter implements MailPort {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
    })

    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${await res.text()}`)
    }
  }
}
