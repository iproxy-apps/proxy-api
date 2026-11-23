import { compare } from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'
import { buildSessionPayload } from '../utils/session-payload'

import type { AuthenticateServiceResponse } from '../types'

type AuthenticateServiceRequest = {
  email: string
  password: string
}

@Injectable()
export class AuthenticateService {
  constructor(
    private jwt: JwtService,
    private authRepository: AuthRepository,
  ) {}

  async execute(
    data: AuthenticateServiceRequest,
  ): Promise<AuthenticateServiceResponse> {
    const { email, password } = data

    const user = await this.authRepository.findByEmail(email)

    if (!user) {
      throw new AppException(errorDictionary.user.notFound)
    }

    const passwordMatches = await compare(password, user.password)

    if (!passwordMatches) {
      throw new AppException(errorDictionary.user.invalidCredentials)
    }

    const session = this.jwt.sign(buildSessionPayload(user))

    return { session }
  }
}
