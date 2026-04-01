import { DynamicModule, Module } from '@nestjs/common'

import { EnvModule } from 'src/env/env.module'
import { EnvService } from 'src/env/env.service'
import { NotificationService } from './notification.service'

@Module({})
export class NotificationModule {
  static forRoot(): DynamicModule {
    return {
      module: NotificationModule,
      imports: [EnvModule],
      providers: [
        NotificationService,
        {
          provide: 'AWS_REGION',
          useFactory: (env: EnvService) => env.get('AWS_REGION'),
          inject: [EnvService],
        },
        {
          provide: 'AWS_ACCESS_KEY_ID',
          useFactory: (env: EnvService) => env.get('AWS_ACCESS_KEY_ID'),
          inject: [EnvService],
        },
        {
          provide: 'AWS_SECRET_ACCESS_KEY',
          useFactory: (env: EnvService) => env.get('AWS_SECRET_ACCESS_KEY'),
          inject: [EnvService],
        },
        {
          provide: 'AWS_SES_FROM_EMAIL',
          useFactory: (env: EnvService) => env.get('AWS_SES_FROM_EMAIL'),
          inject: [EnvService],
        },
      ],
      exports: [NotificationService],
    }
  }
}
