import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { z } from 'zod'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { Env } from 'src/env/env'
import { PrismaService } from 'src/prisma/prisma.service'
import { sessionPayloadSchema } from './session-payload'

import type { SessionPayload } from './session-payload'

export type { SessionPayload }

export const jwtClaimsSchema = sessionPayloadSchema.extend({
  iat: z.number(),
  exp: z.number(),
})

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private prisma: PrismaService,
  ) {
    const publickey = config.get('JWT_PUBLIC_KEY', { infer: true })

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: Buffer.from(publickey, 'base64'),
      algorithms: ['RS256'],
    })
  }

  async validate(payload: unknown): Promise<SessionPayload> {
    const parsed = jwtClaimsSchema.safeParse(payload)
    if (!parsed.success) throw new UnauthorizedException()
    const claims = parsed.data

    const user = await this.prisma.users.findUnique({
      where: { id: claims.sub },
      select: { isDeleted: true, userType: true },
    })
    if (!user || user.isDeleted) throw new UnauthorizedException()

    return { ...claims, userType: user.userType }
  }
}
