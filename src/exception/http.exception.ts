import {
  Catch,
  Logger,
  HttpStatus,
  HttpException,
  ArgumentsHost,
  ExceptionFilter,
} from '@nestjs/common'
import { Request, Response } from 'express'

import { AppException } from './app.exception'
import { errorDictionary } from './error-dictionary'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (exception instanceof AppException) {
        return response.status(status).send({
          statusCode: status,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(typeof exceptionResponse === 'object'
            ? exceptionResponse
            : { message: exceptionResponse }),
        })
      }

      return response.status(status).send({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(typeof exceptionResponse === 'object'
          ? exceptionResponse
          : { message: exceptionResponse }),
      })
    }

    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
      exception instanceof Error ? exception.stack : undefined,
    )

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: errorDictionary.standard.message,
      errorCode: errorDictionary.standard.errorCode,
    })
  }
}
