import {
  Req,
  Post,
  Headers,
  HttpCode,
  Controller,
  RawBodyRequest,
} from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { DispatchStripeEventService } from '../use-cases/dispatch-stripe-event.service'

import type { Request } from 'express'

@Controller('/stripe/webhook')
export class StripeWebhookController {
  constructor(private dispatchStripeEventService: DispatchStripeEventService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
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
