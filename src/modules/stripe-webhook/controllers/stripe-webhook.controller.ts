import {
  Req,
  Post,
  Logger,
  Headers,
  HttpCode,
  Controller,
  RawBodyRequest,
} from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { DispatchStripeEventService } from '../use-cases/dispatch-stripe-event.service'

import type { Request } from 'express'

@SkipThrottle()
@Controller('/stripe/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name)

  constructor(private dispatchStripeEventService: DispatchStripeEventService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.logger.log(
      `Incoming webhook (signature ${signature ? 'present' : 'missing'}, rawBody ${req.rawBody?.length ?? 0} bytes)`,
    )

    if (!req.rawBody) {
      throw new AppException(errorDictionary.webhook.missingRawBody)
    }

    if (!signature) {
      throw new AppException(errorDictionary.webhook.invalidSignature)
    }

    await this.dispatchStripeEventService.execute(req.rawBody, signature)

    return { received: true }
  }
}
