import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/proxy_unit',
  JWT_PRIVATE_KEY: Buffer.from(privateKey).toString('base64'),
  JWT_PUBLIC_KEY: Buffer.from(publicKey).toString('base64'),
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
  STRIPE_CONNECT_RETURN_URL: 'http://localhost:3000/callback',
  AWS_ACCESS_KEY_ID: 'dummy',
  AWS_SECRET_ACCESS_KEY: 'dummy',
  AWS_SES_FROM_EMAIL: 'test@example.com',
}

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value
}
