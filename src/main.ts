import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { EnvService } from './env/env.service'
import { HttpExceptionFilter } from './exception/http.exception'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  app.useGlobalFilters(new HttpExceptionFilter())

  const port = app.get(EnvService).get('PORT') ?? 3333

  console.log('🚀 ~ Starting server on port ', port)
  await app.listen(port)
}

bootstrap()
