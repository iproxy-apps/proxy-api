import { compare } from 'bcryptjs'
import { Injectable } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'
import { AuthRepository } from '../repository/auth.repository'
import { DUMMY_PASSWORD_HASH } from '../utils/password'
import { IssueSessionService } from './issue-session.service'

import type { AuthenticateServiceResponse } from '../types'

type AuthenticateServiceRequest = {
  email: string
  password: string
}

@Injectable()
export class AuthenticateService {
  constructor(
    private issueSessionService: IssueSessionService,
    private authRepository: AuthRepository,
  ) {}

  async execute(
    data: AuthenticateServiceRequest,
  ): Promise<AuthenticateServiceResponse> {
    const { email, password } = data

    const user = await this.authRepository.findByEmail(email)

    // Always run one bcrypt compare so unknown e-mail, deleted user and wrong
    // password are indistinguishable (same 401, same timing).
    const passwordMatches = await compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    )

    if (!user || user.isDeleted || !passwordMatches) {
      throw new AppException(errorDictionary.user.invalidCredentials)
    }

    return await this.issueSessionService.issue(user)
  }
}
