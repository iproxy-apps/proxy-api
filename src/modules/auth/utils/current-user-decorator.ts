import { ExecutionContext, createParamDecorator } from '@nestjs/common'

import type { SessionClaims } from './jwt.strategy'

export const User = createParamDecorator((_: never, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user as SessionClaims
})
