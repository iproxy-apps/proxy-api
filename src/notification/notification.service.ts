import { Inject, Injectable } from '@nestjs/common'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

@Injectable()
export class NotificationService {
  private ses: SESClient
  private sns: SNSClient

  constructor(
    @Inject('AWS_REGION') private awsRegion: string,
    @Inject('AWS_SES_FROM_EMAIL') private fromEmail: string,
    @Inject('AWS_ACCESS_KEY_ID') private awsAccessKeyId: string,
    @Inject('AWS_SECRET_ACCESS_KEY') private awsSecretAccessKey: string,
  ) {
    const credentials = {
      accessKeyId: this.awsAccessKeyId,
      secretAccessKey: this.awsSecretAccessKey,
    }

    this.ses = new SESClient({ region: this.awsRegion, credentials })
    this.sns = new SNSClient({ region: this.awsRegion, credentials })
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: body, Charset: 'UTF-8' } },
      },
    })

    await this.ses.send(command)
  }

  async sendSms(phoneNumber: string, message: string): Promise<void> {
    const command = new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
    })

    await this.sns.send(command)
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
        <p>Olá, <strong>${userName}</strong>!</p>
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

  async sendResetCodeBySms(phoneNumber: string, code: string): Promise<void> {
    const message = `Seu código de recuperação de senha Proxy é: ${code}. Válido por 15 minutos.`
    await this.sendSms(phoneNumber, message)
  }
}
