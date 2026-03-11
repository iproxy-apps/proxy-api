import { ExecutionContext, createParamDecorator } from '@nestjs/common'

import type { SessionPayload } from './jwt.strategy'

export const User = createParamDecorator((_: never, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user as SessionPayload
})
