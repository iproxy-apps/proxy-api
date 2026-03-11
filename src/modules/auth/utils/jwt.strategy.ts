import { z } from 'zod'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { Env } from 'src/env/env'

const sessionPayloadSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  phoneNumber: z.string(),
  stripeAccountId: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  userType: z.string(),
  documentType: z.string().nullable(),
  documentUrl: z.string().nullable(),
  isVerified: z.boolean(),
  rating: z.coerce.number(),
  totalTasksCompleted: z.coerce.number(),
  totalTasksCreated: z.coerce.number(),
  walletBalance: z.coerce.number(),
  termsAccepted: z.boolean(),
})

export type SessionPayload = z.infer<typeof sessionPayloadSchema>

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    const publickey = config.get('JWT_PUBLIC_KEY', { infer: true })

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: Buffer.from(publickey, 'base64'),
      algorithms: ['RS256'],
    })
  }

  async validate(payload: SessionPayload) {
    return sessionPayloadSchema.parse(payload)
  }
}
