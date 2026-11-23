import { Injectable } from '@nestjs/common'

import { escapeHtml } from './escape-html'
import { MailPort } from './mail/mail.port'

@Injectable()
export class NotificationService {
  constructor(private mail: MailPort) {}

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.mail.send({ to, subject, html })
  }

  async sendResetCodeByEmail(
    to: string,
    code: string,
    userName: string,
  ): Promise<void> {
    const subject = 'Código de recuperação de senha - Proxy'
    const body = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #333;">Recuperação de senha</h2>
        <p>Olá, <strong>${escapeHtml(userName)}</strong>!</p>
        <p>Você solicitou a recuperação de senha. Use o código abaixo para redefinir sua senha:</p>
        <div style="background: #f4f4f4; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">Este código expira em <strong>15 minutos</strong>.</p>
        <p style="color: #666; font-size: 14px;">Se você não solicitou esta recuperação, ignore este email.</p>
      </div>
    `

    await this.sendEmail(to, subject, body)
  }

  async sendCardChargeFailedEmail(
    to: string,
    userName: string,
    taskTitle: string,
  ): Promise<void> {
    const subject = 'Confirme seu cartão na Carteira - Proxy'
    const body = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #333;">Confirme seu cartão</h2>
        <p>Olá, <strong>${escapeHtml(userName)}</strong>!</p>
        <p>Um Proxy tentou aceitar sua tarefa "<strong>${escapeHtml(taskTitle)}</strong>", mas não conseguimos cobrar seu cartão.</p>
        <p>Confirme seu cartão na Carteira do app. A tarefa continua disponível.</p>
      </div>
    `

    await this.sendEmail(to, subject, body)
  }
}
