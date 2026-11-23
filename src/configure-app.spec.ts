import { configureApp } from './configure-app'
import { HttpExceptionFilter } from './exception/http.exception'

const makeApp = () => {
  const express = { set: jest.fn() }
  const app = {
    enableCors: jest.fn(),
    useGlobalFilters: jest.fn(),
    enableShutdownHooks: jest.fn(),
    getHttpAdapter: () => ({ getInstance: () => express }),
  }
  return { app, express }
}

describe('configureApp', () => {
  it('enables CORS, the PT exception filter and shutdown hooks', () => {
    const { app } = makeApp()
    configureApp(app as never, { trustProxy: 0 })
    expect(app.enableCors).toHaveBeenCalledTimes(1)
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      expect.any(HttpExceptionFilter),
    )
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1)
  })

  it('does not trust proxies by default', () => {
    const { app, express } = makeApp()
    configureApp(app as never, { trustProxy: 0 })
    expect(express.set).not.toHaveBeenCalled()
  })

  it('sets express trust proxy to the configured hop count', () => {
    const { app, express } = makeApp()
    configureApp(app as never, { trustProxy: 1 })
    expect(express.set).toHaveBeenCalledWith('trust proxy', 1)
  })
})
