import { DynamicModule, Module } from '@nestjs/common'

import { EnvModule } from 'src/env/env.module'
import { EnvService } from 'src/env/env.service'
import { StripeService } from './stripe.service'

@Module({})
export class StripeModule {
  static forRoot(): DynamicModule {
    return {
      module: StripeModule,
      imports: [EnvModule],
      providers: [
        StripeService,
        {
          provide: 'STRIPE_SECRET_KEY',
          useFactory: (env: EnvService) => env.get('STRIPE_SECRET_KEY'),
          inject: [EnvService],
        },
        {
          provide: 'STRIPE_WEBHOOK_SECRET',
          useFactory: (env: EnvService) => env.get('STRIPE_WEBHOOK_SECRET'),
          inject: [EnvService],
        },
        {
          provide: 'STRIPE_CONNECT_WEBHOOK_SECRET',
          useFactory: (env: EnvService) =>
            env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? null,
          inject: [EnvService],
        },
      ],
      exports: [StripeService],
    }
  }
}
