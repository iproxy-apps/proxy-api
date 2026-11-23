import {
  Catch,
  Logger,
  HttpStatus,
  HttpException,
  ArgumentsHost,
  ExceptionFilter,
  NotFoundException,
  UnauthorizedException,
  PayloadTooLargeException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ThrottlerException } from '@nestjs/throttler'
import { Request, Response } from 'express'

import { AppException, AppExceptionProps } from './app.exception'
import { errorDictionary } from './error-dictionary'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    if (exception instanceof AppException) {
      const exceptionResponse = exception.getResponse()

      return this.reply(response, request, {
        statusCode: exception.getStatus(),
        ...(typeof exceptionResponse === 'object'
          ? exceptionResponse
          : { message: exceptionResponse }),
      } as AppExceptionProps)
    }

    if (exception instanceof ThrottlerException) {
      return this.reply(response, request, errorDictionary.http.tooManyRequests)
    }

    if (exception instanceof UnauthorizedException) {
      return this.reply(response, request, errorDictionary.http.unauthorized)
    }

    if (exception instanceof PayloadTooLargeException) {
      return this.reply(response, request, errorDictionary.file.tooLarge)
    }

    if (exception instanceof NotFoundException) {
      return this.reply(response, request, errorDictionary.http.routeNotFound)
    }

    if (exception instanceof HttpException) {
      this.logger.warn(`HTTP exception: ${exception.message}`)

      return this.reply(response, request, {
        message: errorDictionary.standard.message,
        errorCode: errorDictionary.standard.errorCode,
        statusCode: exception.getStatus(),
      })
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return this.reply(response, request, errorDictionary.database.conflict)
        case 'P2025':
          return this.reply(response, request, errorDictionary.database.notFound)
        case 'P2023':
          return this.reply(response, request, errorDictionary.database.invalidId)
      }

      this.logger.error(
        `Unhandled database error ${exception.code}: ${exception.message}`,
        exception.stack,
      )

      return this.replyInternal(response, request)
    }

    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
      exception instanceof Error ? exception.stack : undefined,
    )

    return this.replyInternal(response, request)
  }

  private replyInternal(response: Response, request: Request) {
    return this.reply(response, request, {
      message: errorDictionary.standard.message,
      errorCode: errorDictionary.standard.errorCode,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    })
  }

  private reply(
    response: Response,
    request: Request,
    props: AppExceptionProps,
  ) {
    const statusCode = props.statusCode ?? HttpStatus.BAD_REQUEST

    return response.status(statusCode).send({
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: props.message,
      errorCode: props.errorCode,
      ...(props.info && { info: props.info }),
    })
  }
}
