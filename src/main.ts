import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { configureApp } from './configure-app'
import { EnvService } from './env/env.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  const env = app.get(EnvService)

  configureApp(app, { trustProxy: env.get('TRUST_PROXY') })

  const port = env.get('PORT') ?? 3333

  new Logger('Bootstrap').log(`Listening on port ${port}`)
  await app.listen(port)
}

bootstrap()
