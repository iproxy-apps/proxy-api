import type { INestApplication } from '@nestjs/common'

import { HttpExceptionFilter } from './exception/http.exception'

export type ConfigureAppOptions = { trustProxy: number }

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions,
): INestApplication {
  app.enableCors()
  app.useGlobalFilters(new HttpExceptionFilter())
  app.enableShutdownHooks()

  if (options.trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', options.trustProxy)
  }

  return app
}
