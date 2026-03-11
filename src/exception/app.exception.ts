import { HttpException, HttpStatus } from '@nestjs/common'

export interface AppExceptionProps {
  info?: string
  message: string
  errorCode?: string
  statusCode?: number
}

export class AppException extends HttpException {
  public readonly info?: string
  public readonly errorCode?: string

  constructor({
    message,
    statusCode = HttpStatus.BAD_REQUEST,
    info,
    errorCode,
  }: AppExceptionProps) {
    super(
      {
        message,
        ...(info && { info }),
        ...(errorCode && { errorCode }),
      },
      statusCode,
    )

    this.info = info
    this.errorCode = errorCode
  }
}
