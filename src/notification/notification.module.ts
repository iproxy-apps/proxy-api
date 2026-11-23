import { DynamicModule, Module } from '@nestjs/common'

import { EnvModule } from 'src/env/env.module'
import { EnvService } from 'src/env/env.service'
import { MailPort } from './mail/mail.port'
import { NotificationService } from './notification.service'
import { ResendMailAdapter } from './mail/resend-mail.adapter'
import { SesMailAdapter } from './mail/ses-mail.adapter'

@Module({})
export class NotificationModule {
  static forRoot(): DynamicModule {
    return {
      module: NotificationModule,
      imports: [EnvModule],
      providers: [
        NotificationService,
        {
          provide: MailPort,
          inject: [EnvService],
          useFactory: (env: EnvService): MailPort =>
            env.get('MAIL_PROVIDER') === 'ses'
              ? new SesMailAdapter(
                  env.get('AWS_REGION'),
                  env.get('AWS_ACCESS_KEY_ID')!,
                  env.get('AWS_SECRET_ACCESS_KEY')!,
                  env.get('MAIL_FROM'),
                )
              : new ResendMailAdapter(
                  env.get('RESEND_API_KEY')!,
                  env.get('MAIL_FROM'),
                ),
        },
      ],
      exports: [NotificationService],
    }
  }
}
