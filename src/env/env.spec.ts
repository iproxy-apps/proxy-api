import { envSchema } from './env'

const baseEnv = {
  PORT: '3333',
  NODE_ENV: 'test',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'dummy',
  AWS_SECRET_ACCESS_KEY: 'dummy',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/proxy_test',
  JWT_PUBLIC_KEY: 'pub',
  JWT_PRIVATE_KEY: 'priv',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
  STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_test_connect',
  AWS_SES_FROM_EMAIL: 'test@example.com',
  STRIPE_CONNECT_RETURN_URL: 'http://localhost:3000/callback',
}

describe('envSchema', () => {
  it('rejects a missing NODE_ENV', () => {
    const { NODE_ENV: _omitted, ...env } = baseEnv
    expect(envSchema.safeParse(env).success).toBe(false)
  })

  it('rejects a non-https STRIPE_CONNECT_RETURN_URL in production', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'production',
      STRIPE_CONNECT_RETURN_URL: 'http://x.test',
    })
    expect(result.success).toBe(false)
  })

  it('accepts development with a localhost return URL', () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: 'development',
      STRIPE_CONNECT_RETURN_URL: 'http://localhost:3000/cb',
    })
    expect(result.success).toBe(true)
  })
})
