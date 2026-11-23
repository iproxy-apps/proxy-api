import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { PostgreSqlContainer } from '@testcontainers/postgresql'

const TEST_ENV_PATH = resolve(__dirname, '..', '.env.test')
const perRunEnvPath = () => resolve(__dirname, '..', `.env.test.${process.pid}`)

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

  // Per-run values live in process.env (inherited by the specs, which run in
  // this process) and in a per-run file, never in the shared test/.env.test:
  // two overlapping e2e runs must not see each other's database or keys.
  const proofDir = join(tmpdir(), `proxy-proofs-e2e-${process.pid}`)
  const perRun = {
    DATABASE_URL: databaseUrl,
    JWT_PUBLIC_KEY: publicKey,
    JWT_PRIVATE_KEY: privateKey,
    PROOF_DIR: proofDir,
  }
  const statics = {
    PORT: '3333',
    NODE_ENV: 'test',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'dummy',
    AWS_SECRET_ACCESS_KEY: 'dummy',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_test_connect',
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_test_dummy',
    MAIL_FROM: 'Proxy <test@example.com>',
    STRIPE_CONNECT_RETURN_URL: 'http://localhost:3000/callback',
  }
  const toFile = (values: Record<string, string>) =>
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')

  writeFileSync(TEST_ENV_PATH, toFile(statics))
  writeFileSync(perRunEnvPath(), toFile(perRun))
  Object.assign(process.env, statics, perRun, {
    PROXY_TEST_ENV_FILE: perRunEnvPath(),
  })

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  const globalAny = globalThis as unknown as {
    __PG_CONTAINER__: typeof container
  }
  globalAny.__PG_CONTAINER__ = container
}
