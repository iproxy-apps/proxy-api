import { PipeTransform } from '@nestjs/common'
import { z, ZodError, type ZodType } from 'zod'

import { AppException } from 'src/exception/app.exception'
import { errorDictionary } from 'src/exception/error-dictionary'

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodType) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value)
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppException({
          ...errorDictionary.validation.failed,
          info: z.prettifyError(error),
        })
      }

      throw new AppException(errorDictionary.validation.failed)
    }
  }
}
