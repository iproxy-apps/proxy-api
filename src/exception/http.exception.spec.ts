import { Prisma } from '@prisma/client'
import { ThrottlerException } from '@nestjs/throttler'
import {
  ArgumentsHost,
  NotFoundException,
  UnauthorizedException,
  PayloadTooLargeException,
  BadGatewayException,
} from '@nestjs/common'

import { AppException } from './app.exception'
import { HttpExceptionFilter } from './http.exception'
import { errorDictionary } from './error-dictionary'

const makeHost = () => {
  const send = jest.fn()
  const status = jest.fn(() => ({ send }))
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/x' }),
    }),
  } as unknown as ArgumentsHost
  return { host, status, send }
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db', {
    code,
    clientVersion: '7.3.0',
  })

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter()

  it.each([
    [
      new ThrottlerException(),
      429,
      'TOO_MANY_REQUESTS',
      'Muitas tentativas. Aguarde um minuto e tente novamente.',
    ],
    [
      new UnauthorizedException(),
      401,
      'UNAUTHORIZED',
      'Sessão inválida ou expirada. Entre novamente.',
    ],
    [
      new PayloadTooLargeException('File too large'),
      413,
      'FILE_TOO_LARGE',
      'Arquivo muito grande. O limite é 10 MB.',
    ],
    [
      new NotFoundException('Cannot GET /nope'),
      404,
      'ROUTE_NOT_FOUND',
      'Rota não encontrada.',
    ],
    [
      new BadGatewayException(),
      502,
      'STANDARD_ERROR',
      errorDictionary.standard.message,
    ],
    [
      prismaError('P2002'),
      409,
      'RESOURCE_ALREADY_EXISTS',
      'Já existe um registro com esses dados.',
    ],
    [
      prismaError('P2025'),
      404,
      'RESOURCE_NOT_FOUND',
      'Registro não encontrado.',
    ],
    [
      prismaError('P2023'),
      400,
      'INVALID_IDENTIFIER',
      'Identificador inválido.',
    ],
    [
      prismaError('P1001'),
      500,
      'STANDARD_ERROR',
      errorDictionary.standard.message,
    ],
    [
      new Error('boom'),
      500,
      'STANDARD_ERROR',
      errorDictionary.standard.message,
    ],
  ])('maps %p to %i %s', (exception, statusCode, errorCode, message) => {
    const { host, status, send } = makeHost()
    filter.catch(exception, host)
    expect(status).toHaveBeenCalledWith(statusCode)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode, errorCode, message, path: '/x' }),
    )
  })

  it('passes AppException payloads through untouched', () => {
    const { host, status, send } = makeHost()
    filter.catch(new AppException(errorDictionary.tasks.taskNotFound), host)
    expect(status).toHaveBeenCalledWith(404)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'TASK_NOT_FOUND',
        message: 'Tarefa não encontrada.',
      }),
    )
  })
})
