import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { PostgreSqlContainer } from '@testcontainers/postgresql'

const TEST_ENV_PATH = resolve(__dirname, '..', '.env.test')

const generateRsaKeyPairBase64 = () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  }
}

export default async function globalSetup() {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('proxy_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  const databaseUrl = container.getConnectionUri()
  const { publicKey, privateKey } = generateRsaKeyPairBase64()

  const envContent = [
    `PORT=3333`,
    `NODE_ENV=test`,
    `AWS_REGION=us-east-1`,
    `AWS_ACCESS_KEY_ID=dummy`,
    `AWS_SECRET_ACCESS_KEY=dummy`,
    `DATABASE_URL=${databaseUrl}`,
    `JWT_PUBLIC_KEY=${publicKey}`,
    `JWT_PRIVATE_KEY=${privateKey}`,
    `STRIPE_SECRET_KEY=sk_test_dummy`,
    `STRIPE_WEBHOOK_SECRET=whsec_test_dummy`,
    `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_test_connect`,
    `AWS_SES_FROM_EMAIL=test@example.com`,
    `STRIPE_CONNECT_RETURN_URL=http://localhost:3000/callback`,
    `PROOF_DIR=${join(tmpdir(), 'proxy-proofs-e2e')}`,
  ].join('\n')

  writeFileSync(TEST_ENV_PATH, envContent)

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  const globalAny = globalThis as unknown as {
    __PG_CONTAINER__: typeof container
  }
  globalAny.__PG_CONTAINER__ = container
}
