import { Injectable, HttpStatus, NotFoundException } from '@nestjs/common'

import { AppException } from 'src/exception/app.exception'

import type { CanActivate } from '@nestjs/common'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

export const isTestHooksEnabled = (env: {
  LOOP_TEST_HOOKS?: string
  NODE_ENV?: string
}): boolean => env.LOOP_TEST_HOOKS === '1' && env.NODE_ENV !== 'production'

export const isLocalDatabase = (databaseUrl: string): boolean => {
  try {
    return LOCAL_HOSTS.includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
}

@Injectable()
export class TestHooksGuard implements CanActivate {
  canActivate(): boolean {
    if (
      !isTestHooksEnabled({
        LOOP_TEST_HOOKS: process.env.LOOP_TEST_HOOKS,
        NODE_ENV: process.env.NODE_ENV,
      })
    ) {
      throw new NotFoundException()
    }

    if (!isLocalDatabase(process.env.DATABASE_URL ?? '')) {
      throw new AppException({
        statusCode: HttpStatus.FORBIDDEN,
        errorCode: 'TEST_HOOKS_FORBIDDEN',
        message: 'Hooks de teste só funcionam contra um banco local.',
      })
    }

    return true
  }
}
