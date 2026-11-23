import { z } from 'zod'

import { AppException } from 'src/exception/app.exception'
import { ZodValidationPipe } from './zod-validation.pipe'

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ email: z.email() }))

  it('returns the parsed value', () => {
    expect(pipe.transform({ email: 'a@b.io' })).toEqual({ email: 'a@b.io' })
  })

  it('throws a Portuguese AppException with VALIDATION_FAILED', () => {
    let caught: unknown
    try {
      pipe.transform({ email: 'nope' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AppException)
    const exception = caught as AppException
    expect(exception.getStatus()).toBe(400)
    expect(exception.errorCode).toBe('VALIDATION_FAILED')
    expect(exception.getResponse()).toMatchObject({
      message: 'Dados inválidos. Verifique os campos e tente novamente.',
      errorCode: 'VALIDATION_FAILED',
      info: expect.stringContaining('email'),
    })
  })
})
